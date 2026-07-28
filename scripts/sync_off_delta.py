#!/usr/bin/env python3
"""§6.2 Ongoing delta sync — trajectory-app-technical-specification.md.

Run on a schedule (`.github/workflows/off-sync.yml`, fortnightly). Keeps
src/data/off/off_seed.json current between the one-time bulk import's runs (§6.1) by
applying OFF's daily delta files — except when too much time has passed for deltas
alone to be trustworthy (the "fortnight safety net"), or when it's been long enough
that upstream deletions need reconciling (deltas can never represent a deletion — OFF's
own docs are explicit about this, confirmed independently this session, see below) —
in either case falling back to a full re-import instead (§6.1's pipeline, reused).

WHAT'S VERIFIED VS. NOT
--------------------------------------------------------------------------------
Verified this session (web search, July 2026): OFF publishes a delta index at
DELTA_INDEX_URL (a plain-text list of filenames, one per line) with each file at
DELTA_FILE_BASE_URL + filename — gzipped JSON Lines, filenames encoding the Unix
timestamp range of changes each file covers, meant to be applied in (alphabetical =
chronological) order. Deletions are confirmed NOT represented in deltas, matching
§6.2's own stated reason for the 6-month full-reimport trigger.

NOT verified: this sandbox's network allowlist blocks static.openfoodfacts.org
outright, so nobody in this session has actually fetched a real index.txt or delta
file. Consequently unconfirmed: the exact filename format/delimiter (extract_end_timestamp
below is deliberately delimiter-agnostic — it just finds the largest 10-digit number in
the filename — specifically so the exact format not being confirmed doesn't matter),
and whether each delta record's JSON shape matches OFF's standard product-document
shape (nutriments nested, `code`/`product_name`/`brands` top-level) assumed by
flatten_delta_record below — the same assumption offLiveSearch.ts and
import_off_bulk.py make about OFF's product JSON elsewhere, for consistency, but
unverified here specifically for delta records. First real run against actual delta
files is what confirms or corrects this.

Everything below is split the same way as extract_icmr.py and import_off_bulk.py: pure
functions (decide_sync_action, extract_end_timestamp, filter_delta_filenames,
flatten_delta_record, upsert_off_items) are fully unit-tested against synthetic input
in test_sync_off_delta.py; the network-touching functions (fetch_delta_index,
fetch_delta_file_records) are implemented for real but not exercised by any test here.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

from off_common import (
    DEFAULT_CURATED_BRANDS_PATH,
    flat_row_to_off_food_item,
    is_india_or_curated_brand,
    load_curated_brands,
    read_sync_meta,
    write_sync_meta,
)

DELTA_INDEX_URL = "https://static.openfoodfacts.org/data/delta/index.txt"
DELTA_FILE_BASE_URL = "https://static.openfoodfacts.org/data/delta/"

# §6.2: "if days_since <= 13: normal path ... else: safety net" — the boundary is
# *inclusive* of 13, so a gap of exactly 14 days is what first triggers the fallback,
# matching the spec's pseudocode exactly (not "13 days" and not "14 days" by an
# off-by-one in either direction).
FORTNIGHT_SAFETY_NET_DAYS = 13

# §6.2: "run a full re-import every 6 months regardless, to reconcile products that
# were removed upstream". "6 months" isn't given as an exact day count in the spec;
# 183 days (~6 × 30.5) is this script's own reasonable reading of it, not a transcribed
# number — flagged the same way other such choices are flagged elsewhere in this repo.
DELETION_RECONCILIATION_DAYS = 183


def _days_since(iso_date_str: Optional[str], today: date) -> Optional[int]:
    """None means "no prior date recorded" (first-ever run, or a field that was never
    set) — kept distinct from a large integer rather than approximated as infinity, so
    callers can produce a clearer log message ("no prior sync recorded" vs. "9999 days
    since last sync")."""
    if not iso_date_str:
        return None
    return (today - date.fromisoformat(iso_date_str)).days


@dataclass
class SyncDecision:
    action: str  # "apply_deltas" | "full_reimport"
    reasons: list[str] = field(default_factory=list)


def decide_sync_action(
    last_delta_applied_date: Optional[str],
    last_full_reimport_date: Optional[str],
    today: date,
) -> SyncDecision:
    """§6.2's branching logic, combined into one decision rather than two independent
    sequential actions (see this module's docstring in extract_icmr.py-style detail
    below for why).

    The spec's pseudocode presents the fortnight check and the 6-month
    deletion-reconciliation check as two separate steps — an if/else for the former,
    then a comment describing the latter as happening "independently of the above,
    regardless". Read maximally literally, that could mean *both* firing on the same
    run: apply deltas (fortnight check passes), then immediately also do a full
    reimport (6-month check also happens to be due) — which would make the just-applied
    deltas pointless work, immediately overwritten. This function instead treats "does
    ANY condition call for a full reimport" as one combined question and does at most
    one action per run — a full reimport already satisfies *both* purposes (it's a
    superset of what applying deltas would achieve, and inherently reconciles
    deletions), so there's nothing a second, immediately-following action would add.
    Both reasons are still surfaced (in `reasons`) when they co-occur, so this
    collapsing doesn't lose the "why" even though it changes "how many actions run".
    """
    days_since_delta = _days_since(last_delta_applied_date, today)
    days_since_full = _days_since(last_full_reimport_date, today)

    missed_window = days_since_delta is None or days_since_delta > FORTNIGHT_SAFETY_NET_DAYS
    deletion_reconciliation_due = (
        days_since_full is None or days_since_full >= DELETION_RECONCILIATION_DAYS
    )

    reasons: list[str] = []
    if missed_window:
        reasons.append(
            "no prior delta sync recorded"
            if days_since_delta is None
            else f"{days_since_delta} days since last delta sync exceeds the "
            f"{FORTNIGHT_SAFETY_NET_DAYS}-day safety window"
        )
    if deletion_reconciliation_due:
        reasons.append(
            "no prior full reimport recorded"
            if days_since_full is None
            else f"{days_since_full} days since last full reimport reaches the "
            f"{DELETION_RECONCILIATION_DAYS}-day deletion-reconciliation interval"
        )

    if missed_window or deletion_reconciliation_due:
        return SyncDecision(action="full_reimport", reasons=reasons)
    return SyncDecision(action="apply_deltas", reasons=[])


_TIMESTAMP_RE = re.compile(r"(\d{10})")


def extract_end_timestamp(filename: str) -> Optional[int]:
    """The larger of any 10-digit numbers found in `filename`, standing in for "this
    file's most recent change timestamp" without assuming a specific delimiter or
    position (§6.2's own doc says a filename "contains" the first/last timestamps of
    its changes, not the exact format — see module docstring). Returns None if no
    10-digit run is found at all (an unexpectedly-shaped index.txt line), which callers
    should treat as "can't determine freshness, include this file to be safe" rather
    than silently skipping it.
    """
    matches = _TIMESTAMP_RE.findall(filename)
    if not matches:
        return None
    return max(int(m) for m in matches)


def parse_delta_index(index_text: str) -> list[str]:
    return [line.strip() for line in index_text.splitlines() if line.strip()]


def filter_delta_filenames(filenames: list[str], since: date) -> list[str]:
    """Keeps files covering changes at/after `since` (midnight UTC), and — per
    extract_end_timestamp's contract — any file whose timestamp couldn't be determined
    at all, erring toward re-processing a file unnecessarily (idempotent: upserting the
    same record twice is harmless) over silently missing one that mattered. Preserves
    input order, which callers should ensure is index.txt's own order (alphabetical =
    chronological, per §6.2).
    """
    since_ts = int(datetime(since.year, since.month, since.day, tzinfo=timezone.utc).timestamp())
    kept = []
    for filename in filenames:
        end_ts = extract_end_timestamp(filename)
        if end_ts is None or end_ts >= since_ts:
            kept.append(filename)
    return kept


def flatten_delta_record(raw: dict) -> dict:
    """Normalizes one raw OFF product-JSON-shaped delta record into the same flat shape
    import_off_bulk.py's SQL SELECT produces — see off_common.py's
    flat_row_to_off_food_item, which both pipelines feed into identically once their
    respective raw shapes have been flattened to this common one.
    """
    nutriments = raw.get("nutriments") or {}
    return {
        "code": raw.get("code"),
        "product_name": raw.get("product_name"),
        "brands": raw.get("brands"),
        "countries_tags": raw.get("countries_tags"),
        "kcal_100g": nutriments.get("energy-kcal_100g"),
        "proteins_100g": nutriments.get("proteins_100g"),
        "fat_100g": nutriments.get("fat_100g"),
        "carbohydrates_100g": nutriments.get("carbohydrates_100g"),
        "fiber_100g": nutriments.get("fiber_100g"),
        "sugars_100g": nutriments.get("sugars_100g"),
        "sodium_100g": nutriments.get("sodium_100g"),
    }


def upsert_off_items(existing: list[dict], updates: list[dict]) -> list[dict]:
    """Merges `updates` into `existing` by `offId` — OFF's own stable product code, not
    this app's internal `id` (same reasoning as src/search/unifiedSearch.ts's dedup
    key). Critically, when an update matches an existing item, the existing item's
    internal `id` is preserved rather than replaced with the freshly-minted one
    flat_row_to_off_food_item gave the update — `id` is contractually "stable forever
    once created" (§4.2's FoodItemBase), and by the time a product is already in
    off_seed.json, its `id` may already be referenced by a user's own recipe or log
    entries. Only genuinely new products (no existing `offId` match) keep their
    freshly-minted `id`.
    """
    by_off_id: dict[str, dict] = {item["offId"]: dict(item) for item in existing}
    for update in updates:
        off_id = update["offId"]
        if off_id in by_off_id:
            merged = dict(update)
            merged["id"] = by_off_id[off_id]["id"]
            by_off_id[off_id] = merged
        else:
            by_off_id[off_id] = dict(update)
    return list(by_off_id.values())


# --------------------------------------------------------------------------------------
# Network-touching functions — real implementations, NOT exercised by any test in this
# repo (no network access to static.openfoodfacts.org from this sandbox — see module
# docstring).
# --------------------------------------------------------------------------------------


def fetch_delta_index() -> list[str]:
    import requests  # deferred import, consistent with the other scripts' pattern

    response = requests.get(DELTA_INDEX_URL, timeout=30, headers={"User-Agent": "trajectory-app/1.0 (personal use)"})
    response.raise_for_status()
    return parse_delta_index(response.text)


def fetch_delta_file_records(filename: str) -> Iterator[dict]:
    import gzip

    import requests  # deferred import, consistent with the other scripts' pattern

    response = requests.get(
        DELTA_FILE_BASE_URL + filename, timeout=120, headers={"User-Agent": "trajectory-app/1.0 (personal use)"}
    )
    response.raise_for_status()
    decompressed = gzip.decompress(response.content)
    for line in decompressed.decode("utf-8").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        yield json.loads(stripped)


def fetch_delta_records(since: date) -> Iterator[dict]:
    filenames = filter_delta_filenames(fetch_delta_index(), since)
    for filename in filenames:
        yield from fetch_delta_file_records(filename)


# --------------------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------------------


def run_sync(
    sync_meta_path: Path,
    off_seed_path: Path,
    curated_brands_path: Path,
    parquet_url: str,
    *,
    today: Optional[date] = None,
    delta_records_fetcher=fetch_delta_records,
    bulk_importer=None,
) -> dict:
    """`delta_records_fetcher` and `bulk_importer` are testing seams — production
    leaves both at their defaults (real network calls, and import_off_bulk.run_bulk_import
    respectively, the latter imported lazily below to avoid a hard dependency on
    duckdb for anyone only exercising the delta-apply path); tests inject fakes so the
    orchestration (which branch runs, what gets written, sync-meta bookkeeping) is
    checked without touching a network or a real DuckDB/Parquet read.
    """
    today = today or datetime.now(timezone.utc).date()
    meta = read_sync_meta(sync_meta_path)
    decision = decide_sync_action(meta.get("lastDeltaAppliedDate"), meta.get("lastFullReimportDate"), today)

    if decision.action == "full_reimport":
        if bulk_importer is None:
            from import_off_bulk import run_bulk_import as bulk_importer  # type: ignore[no-redef]
        written, skipped = bulk_importer(parquet_url, curated_brands_path, off_seed_path)
        meta["lastFullReimportDate"] = today.isoformat()
        summary = {
            "action": "full_reimport",
            "reasons": decision.reasons,
            "itemsWritten": written,
            "itemsSkipped": skipped,
        }
    else:
        curated_brands = load_curated_brands(curated_brands_path)
        last_sync_str = meta.get("lastDeltaAppliedDate")
        since = date.fromisoformat(last_sync_str) if last_sync_str else today

        existing = json.loads(off_seed_path.read_text(encoding="utf-8")) if off_seed_path.exists() else []

        updates: list[dict] = []
        for raw in delta_records_fetcher(since):
            flat = flatten_delta_record(raw)
            if not is_india_or_curated_brand(flat.get("countries_tags"), flat.get("brands"), curated_brands):
                continue
            item = flat_row_to_off_food_item(flat)
            if item is not None:
                updates.append(item)

        merged = upsert_off_items(existing, updates)
        off_seed_path.parent.mkdir(parents=True, exist_ok=True)
        off_seed_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        summary = {
            "action": "apply_deltas",
            "reasons": [],
            "itemsUpdated": len(updates),
            "totalItems": len(merged),
        }

    meta["lastDeltaAppliedDate"] = today.isoformat()  # both paths bring the dataset current
    write_sync_meta(sync_meta_path, meta)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sync-meta", type=Path, default=Path("src/data/off/sync-meta.json"))
    parser.add_argument("--off-seed", type=Path, default=Path("src/data/off/off_seed.json"))
    parser.add_argument("--curated-brands", type=Path, default=DEFAULT_CURATED_BRANDS_PATH)
    parser.add_argument(
        "--parquet-url",
        default="https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet",
    )
    args = parser.parse_args()

    summary = run_sync(args.sync_meta, args.off_seed, args.curated_brands, args.parquet_url)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
