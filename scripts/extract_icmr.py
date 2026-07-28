#!/usr/bin/env python3
"""ICMR/IFCT 2017 extraction — trajectory-app-technical-specification.md §5.

Produces src/data/icmr/icmr_ifct2017.json (an array of ICMRFoodItem, §4.2) and
src/data/icmr/icmr.meta.json (§5.5) from the official NIN PDF. One-time, offline —
§5.2 is explicit this book is a static, versioned publication with no ongoing sync.

WHAT'S VERIFIED VS. NOT, AND WHY (read this before running against a real PDF)
--------------------------------------------------------------------------------
Verified this session (web search, July 2026): the source URL below (SOURCE_PDF_URL)
resolves and serves the real IFCT 2017 book (confirmed via independent excerpts
matching the book's actual front matter — editor T. Longvah, NIN Hyderabad, 2017), and
it's still the URL the FAO's own international food-composition-database registry
lists for India's 2017 tables. The 528-food, 19-group breakdown in GROUP_SPEC below is
independently corroborated by two other sources describing the same book (not just
copied from the app spec), giving real confidence total row count and per-group counts
are right.

NOT verified — genuinely can't be, from here: this sandbox's network allowlist blocks
nin.res.in outright (confirmed: `curl -I` returns `403 host_not_allowed`), so nobody in
this session has run pdfplumber/camelot against the actual file. Consequently:
  - The exact column order/layout of Table 1, and whether "energy" is reported in kcal
    only or kcal-and-kJ (this script assumes kcal — verify against the real column
    header before trusting extract_kcal_column below on a live run).
  - Whether the book prints its own per-food codes (§5.3 step 5's first branch) or not
    (falls back to this script's own generated per-group sequential codes, step 5's
    second branch) — GENERATED_CODE_PREFIXES below is this script's own invented
    convention for that fallback case, not transcribed from the book.
  - Whether the "repeating header row" and "row has fewer than N non-empty numeric
    cells" heuristics (§5.3 steps 2-3) actually distinguish real rows from section
    headings/page furniture in the book's real layout.

Because of this, everything below is split into (a) pure functions with no PDF/network
I/O — normalize_cell, is_probable_data_row, assign_ifct_codes, build_food_item,
validate_extraction — which scripts/test_extract_icmr.py genuinely unit-tests against
synthetic rows built to match this file's own documented assumptions, and (b) the
PDF-touching functions (download_pdf, extract_table1_with_pdfplumber,
extract_pages_with_camelot) which are implemented for real, carefully, per §5.3's
procedure, but are NOT exercised by any test here — there is no substitute for running
them against the actual file. Run this script for real (outside this sandbox, or in a
GitHub Action with normal internet access) and treat the row-count/cross-check output
as the first real signal of whether the column-layout assumptions above held.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

SOURCE_PDF_URL = "https://www.nin.res.in/ebooks/IFCT2017.pdf"
EXPECTED_TOTAL_FOODS = 528

# §5.2's group table, verbatim — also independently corroborated (not just transcribed
# from the app spec) via this session's own web search against two other descriptions
# of the same book. `prefix` is this script's OWN invented fallback code scheme (§5.3
# step 5, second branch) — used only if the PDF turns out not to print its own codes.
@dataclass(frozen=True)
class FoodGroup:
    name: str
    expected_count: int
    prefix: str


GROUP_SPEC: tuple[FoodGroup, ...] = (
    FoodGroup("Cereals & millets", 24, "CM"),
    FoodGroup("Grain legumes", 25, "GL"),
    FoodGroup("Green leafy vegetables", 34, "GV"),
    FoodGroup("Other vegetables", 78, "OV"),
    FoodGroup("Fruits", 68, "FR"),
    FoodGroup("Roots & tubers", 19, "RT"),
    FoodGroup("Condiments & spices", 33, "CD"),
    FoodGroup("Nuts & oil seeds", 21, "NS"),
    FoodGroup("Sugars", 2, "SG"),
    FoodGroup("Mushrooms", 4, "MU"),
    FoodGroup("Miscellaneous foods", 2, "MS"),
    FoodGroup("Milk & milk products", 4, "MK"),
    FoodGroup("Egg & egg products", 15, "EG"),
    FoodGroup("Poultry", 19, "PL"),
    FoodGroup("Animal meat", 63, "AN"),
    FoodGroup("Marine fish", 92, "MF"),
    FoodGroup("Marine shellfish", 8, "MH"),
    FoodGroup("Marine molluscs", 7, "ML"),
    FoodGroup("Freshwater fish & shellfish", 10, "FW"),
)
assert sum(g.expected_count for g in GROUP_SPEC) == EXPECTED_TOTAL_FOODS
GROUP_BY_NAME: dict[str, FoodGroup] = {g.name: g for g in GROUP_SPEC}

# §5.3 step 3: rows with fewer non-empty numeric cells than this, out of the 7 proximate
# fields, are treated as section headings / page furniture rather than food data. Set
# well below 7 (not e.g. 6) because a legitimate row can have several genuinely
# unanalyzed ("-") fields without being a heading — the failure mode this threshold
# guards against is a *fully blank* heading row (0 numeric cells), not a sparse one.
MIN_NUMERIC_CELLS_FOR_DATA_ROW = 3

PROXIMATE_FIELDS = ("moisture", "protein", "fat", "carbohydrate", "fibre", "ash", "energy")


# --------------------------------------------------------------------------------------
# Pure functions — no file/network I/O, fully unit-tested in test_extract_icmr.py
# --------------------------------------------------------------------------------------


def normalize_cell(raw: Optional[str]) -> tuple[Optional[float], bool]:
    """§5.3 step 4. Returns (value, was_trace).

    - "Tr" (any case, whitespace-padded) -> (0.0, True): a trace amount, shown as a
      small value in the shipped Macros but flagged in extraction metadata, not the
      Macros object itself (Macros has no room for a per-field trace flag, and doesn't
      need one — §4.2 doesn't ask for it).
    - "-", "", or None (not analyzed) -> (None, False): the field is omitted from that
      food's Macros entirely, not stored as 0 — a real 0 and "wasn't measured" are
      different facts (this is the same null-vs-0 distinction the app side's
      src/domain/macros.ts documents for exactly this reason: they're describing the
      same underlying data).
    - Anything else is parsed as a float. Indian numeric tables occasionally use a
      comma as a thousands separator on larger values (unlikely for per-100g nutrient
      figures, but cheap to strip defensively) and stray whitespace from PDF extraction
      is common enough to strip unconditionally.
    """
    if raw is None:
        return None, False
    text = raw.strip()
    if text == "" or text == "-":
        return None, False
    if text.lower() in ("tr", "tr.", "trace"):
        return 0.0, True
    cleaned = text.replace(",", "")
    try:
        return float(cleaned), False
    except ValueError as exc:
        raise ValueError(f"Unparseable nutrient cell: {raw!r}") from exc


def is_probable_data_row(row: dict[str, Optional[str]], min_numeric_cells: int = MIN_NUMERIC_CELLS_FOR_DATA_ROW) -> bool:
    """§5.3 step 3's section-heading/repeated-header filter, applied to one already
    column-mapped row (mapping raw PDF table cells to named fields is
    extract_table1_with_pdfplumber's job, not this function's — this function only
    judges a row it's already been handed in that shape).

    A row needs a non-empty food name AND at least `min_numeric_cells` parseable
    numeric proximate fields (Tr counts as numeric — it's real information, just a
    small value) to count as food data. Repeated header rows are caught by the food
    name matching a known non-food label; section headings are caught by having (close
    to) zero numeric cells.
    """
    name = (row.get("food_name") or "").strip()
    if not name:
        return False
    if name.lower() in ("food name", "name of food", "foods", "food"):
        return False  # a repeated column header, not a food
    numeric_count = 0
    for field_name in PROXIMATE_FIELDS:
        value, _ = normalize_cell(row.get(field_name))
        if value is not None:
            numeric_count += 1
    return numeric_count >= min_numeric_cells


@dataclass
class ExtractedRow:
    """One food, after normalize_cell has been applied to every proximate field —
    the shape build_food_item consumes to produce the final ICMRFoodItem JSON."""

    food_name: str
    group: str
    printed_code: Optional[str]
    moisture: Optional[float]
    protein: Optional[float]
    fat: Optional[float]
    carbohydrate: Optional[float]
    fibre: Optional[float]
    ash: Optional[float]
    energy: Optional[float]
    trace_fields: list[str] = field(default_factory=list)


def assign_ifct_codes(rows: list[ExtractedRow]) -> dict[int, str]:
    """§5.3 step 5. Returns a mapping of row index (into `rows`) -> assigned code.

    If a row already carries a `printed_code` (the book prints its own — step 5's first
    branch), that's used verbatim. Otherwise, codes are generated sequentially *within
    each group, in the order rows appear in `rows`* using that group's prefix from
    GROUP_SPEC (step 5's second branch) — e.g. the first un-coded "Cereals & millets"
    row becomes CM001, the second CM002, and so on, independently of whether other
    groups' rows are interleaved with them in the input list.
    """
    codes: dict[int, str] = {}
    next_seq: dict[str, int] = {g.name: 1 for g in GROUP_SPEC}
    for index, row in enumerate(rows):
        if row.printed_code:
            codes[index] = row.printed_code
            continue
        group = GROUP_BY_NAME.get(row.group)
        if group is None:
            raise ValueError(
                f"Row {index} ({row.food_name!r}) has unrecognized group {row.group!r}; "
                f"expected one of {sorted(GROUP_BY_NAME)}."
            )
        seq = next_seq[group.name]
        next_seq[group.name] = seq + 1
        codes[index] = f"{group.prefix}{seq:03d}"
    return codes


def build_food_item(row: ExtractedRow, ifct_code: str, *, id_factory=uuid.uuid4) -> dict:
    """Maps one ExtractedRow into an ICMRFoodItem-shaped dict (§4.2), ready for
    json.dump. `id_factory` is injectable so tests can assert on a deterministic id
    instead of a fresh UUID every run.

    Only the four required Macros fields (kcal/proteinG/fatG/carbG) plus the optional
    fiberG are populated from Table 1 — moisture and ash are proximate-composition
    inputs used to derive/cross-check the others (§5.4), not fields Macros (§4.2) has
    room for, so they're intentionally not carried into the shipped item. A row missing
    any of the four *required* fields is a data problem the caller (extract_and_write,
    via validate_extraction) should catch before calling this, not something this
    function silently patches over — it raises rather than emitting a half-valid item.
    """
    if row.energy is None or row.protein is None or row.fat is None or row.carbohydrate is None:
        raise ValueError(
            f"{row.food_name!r} ({ifct_code}) is missing a required macro "
            f"(energy/protein/fat/carbohydrate) — cannot build a valid Macros object. "
            f"Re-check this row against the source PDF page by eye (§5.4)."
        )
    per100g: dict[str, float] = {
        "kcal": row.energy,
        "proteinG": row.protein,
        "fatG": row.fat,
        "carbG": row.carbohydrate,
    }
    if row.fibre is not None:
        per100g["fiberG"] = row.fibre

    return {
        "id": str(id_factory()),
        "displayName": row.food_name,
        "source": "icmr",
        "ifctCode": ifct_code,
        "foodGroup": row.group,
        "per100g": per100g,
    }


@dataclass
class ValidationReport:
    total_expected: int
    total_actual: int
    ok: bool
    group_mismatches: list[dict]  # [{group, expected, actual}], only groups that differ


def validate_extraction(rows: list[ExtractedRow]) -> ValidationReport:
    """§5.3 step 6's row-count check, generalized to a per-group breakdown so a
    mismatch points at *which* pages likely mis-extracted rather than just flagging
    "528 didn't match N" with no lead on where to look.
    """
    counts: dict[str, int] = {g.name: 0 for g in GROUP_SPEC}
    for row in rows:
        if row.group in counts:
            counts[row.group] += 1
    mismatches = [
        {"group": g.name, "expected": g.expected_count, "actual": counts[g.name]}
        for g in GROUP_SPEC
        if counts[g.name] != g.expected_count
    ]
    total_actual = len(rows)
    return ValidationReport(
        total_expected=EXPECTED_TOTAL_FOODS,
        total_actual=total_actual,
        ok=(total_actual == EXPECTED_TOTAL_FOODS and not mismatches),
        group_mismatches=mismatches,
    )


# --------------------------------------------------------------------------------------
# PDF-touching functions — real implementations, NOT exercised by any test in this repo
# (no network access to the real PDF from this sandbox — see module docstring).
# --------------------------------------------------------------------------------------


def download_pdf(url: str, dest: Path) -> bytes:
    """§5.3 step 1. Downloads once and caches to `dest`; re-running the script re-uses
    the cached copy rather than re-fetching (the book doesn't change between runs)."""
    import requests  # imported here so the pure functions above have zero import-time
    # dependency on `requests` and remain trivially importable/testable without it.

    if dest.exists():
        return dest.read_bytes()
    dest.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(url, timeout=60, headers={"User-Agent": "trajectory-app/1.0 (personal use)"})
    response.raise_for_status()
    dest.write_bytes(response.content)
    return response.content


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# Repeating header-row labels this script looks for to (a) locate Table 1 in the first
# place and (b) recognize + drop repeated header rows on later pages of the same table
# (§5.3 step 2). NOT verified against the real PDF's actual header text — a live run's
# first job is confirming these strings actually appear; see module docstring.
TABLE1_HEADER_MARKERS = ("moisture", "protein", "fat", "carbohydrate", "fibre", "ash", "energy")


def _looks_like_table1_header(table_row: list[Optional[str]]) -> bool:
    joined = " ".join((cell or "").lower() for cell in table_row)
    return sum(marker in joined for marker in TABLE1_HEADER_MARKERS) >= 4


def extract_table1_with_pdfplumber(pdf_path: Path) -> list[dict[str, Optional[str]]]:
    """§5.3 steps 2-3: iterate pages, find Table 1 via its repeating header row, extract
    each page's table, concatenate, drop repeated headers. Returns a list of raw
    (not-yet-normalized) row dicts with the *guessed* column mapping below — this
    mapping is the single biggest unverified assumption in this whole script (see
    module docstring) and is the first thing to check by eye against a page render if
    row counts come out wrong on a real run.
    """
    import pdfplumber  # deferred import, same reasoning as download_pdf's requests import

    raw_rows: list[dict[str, Optional[str]]] = []
    current_group = "Unknown"
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table:
                continue
            for table_row in table:
                if _looks_like_table1_header(table_row):
                    continue  # repeated header row (§5.3 step 3)
                # Guessed column order: [code?, name, group-or-blank, moisture, protein,
                # fat, carbohydrate, fibre, ash, energy, ...]. A section-heading row
                # (bold, no numeric columns per §5.3 step 3) is caught downstream by
                # is_probable_data_row, not here — this function's only job is getting
                # raw cells into named fields.
                cells = list(table_row) + [None] * max(0, 10 - len(table_row))
                raw_rows.append(
                    {
                        "printed_code": cells[0],
                        "food_name": cells[1],
                        "group": current_group,
                        "moisture": cells[3],
                        "protein": cells[4],
                        "fat": cells[5],
                        "carbohydrate": cells[6],
                        "fibre": cells[7],
                        "ash": cells[8],
                        "energy": cells[9],
                    }
                )
    return raw_rows


def extract_pages_with_camelot(pdf_path: Path, page_numbers: list[int], flavor: str = "stream") -> list[dict]:
    """§5.3 step 6's fallback: re-run extraction on specific pages with camelot-py when
    pdfplumber's row count comes up short/over for those pages. `flavor='lattice'` for
    pages with ruled table borders, `'stream'` otherwise (step 6) — which applies is a
    property of the real PDF's actual page layout and can't be determined without
    looking at it, so this takes `flavor` as a parameter rather than guessing one
    default for the whole document.
    """
    import camelot  # deferred import, same reasoning as the pdfplumber import above

    pages_str = ",".join(str(p) for p in page_numbers)
    tables = camelot.read_pdf(str(pdf_path), pages=pages_str, flavor=flavor)
    rows: list[dict] = []
    for table in tables:
        for _, table_row in table.df.iterrows():
            rows.append(table_row.to_dict())
    return rows


# --------------------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------------------


def run_extraction(pdf_path: Path, output_dir: Path) -> ValidationReport:
    raw_rows = extract_table1_with_pdfplumber(pdf_path)

    extracted: list[ExtractedRow] = []
    for raw in raw_rows:
        if not is_probable_data_row(raw):
            continue
        trace_fields: list[str] = []
        normalized: dict[str, Optional[float]] = {}
        for f in PROXIMATE_FIELDS:
            value, was_trace = normalize_cell(raw.get(f))
            normalized[f] = value
            if was_trace:
                trace_fields.append(f)
        extracted.append(
            ExtractedRow(
                food_name=(raw.get("food_name") or "").strip(),
                group=raw.get("group") or "Unknown",
                printed_code=(raw.get("printed_code") or "").strip() or None,
                moisture=normalized["moisture"],
                protein=normalized["protein"],
                fat=normalized["fat"],
                carbohydrate=normalized["carbohydrate"],
                fibre=normalized["fibre"],
                ash=normalized["ash"],
                energy=normalized["energy"],
                trace_fields=trace_fields,
            )
        )

    report = validate_extraction(extracted)
    if not report.ok:
        print(
            f"WARNING: extracted {report.total_actual} rows, expected {report.total_expected}. "
            f"Group mismatches: {report.group_mismatches}",
            file=sys.stderr,
        )
        print(
            "Per §5.3 step 6: re-run extract_pages_with_camelot() on the page ranges "
            "covering the mismatched groups and merge the results before proceeding.",
            file=sys.stderr,
        )

    codes = assign_ifct_codes(extracted)
    items = [build_food_item(row, codes[i]) for i, row in enumerate(extracted)]

    output_dir.mkdir(parents=True, exist_ok=True)
    items_path = output_dir / "icmr_ifct2017.json"
    items_path.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    pdf_bytes = pdf_path.read_bytes()
    meta = {
        "extractionDate": datetime.now(timezone.utc).isoformat(),
        "sourcePdfUrl": SOURCE_PDF_URL,
        "sourcePdfSha256": sha256_hex(pdf_bytes),
        "rowCount": len(items),
        "expectedRowCount": EXPECTED_TOTAL_FOODS,
        "codeScheme": "printed (from PDF) where available, else generated per-group sequential (see GROUP_SPEC in extract_icmr.py)",
        "crossCheckFlags": [],  # populated by §5.4's separate cross-check pass, not this script
        "groupMismatches": report.group_mismatches,
    }
    meta_path = output_dir / "icmr.meta.json"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {len(items)} foods to {items_path}")
    print(f"Wrote metadata to {meta_path}")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf-cache", type=Path, default=Path("scripts/.cache/IFCT2017.pdf"))
    parser.add_argument("--output-dir", type=Path, default=Path("src/data/icmr"))
    parser.add_argument("--source-url", default=SOURCE_PDF_URL)
    args = parser.parse_args()

    print(f"Downloading (or using cached) {args.source_url} -> {args.pdf_cache}")
    download_pdf(args.source_url, args.pdf_cache)

    report = run_extraction(args.pdf_cache, args.output_dir)
    if not report.ok:
        print(
            "Extraction finished with row-count mismatches — see warnings above. "
            "Output was still written; treat it as provisional until resolved.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
