"""Shared logic between import_off_bulk.py (§6.1) and sync_off_delta.py (§6.2): the
filter criteria and the OFF-row -> OFFFoodItem (§4.2) mapping. Kept in one place so
both pipelines can't independently drift on what "the same filter" means — §6.2's own
premise (deltas keep a bulk-imported dataset current) depends on a product that would
have qualified for the bulk import still qualifying under the delta path's filter, or
it silently starts falling through the cracks the day the two definitions diverge.

Unit note, since it's easy to get wrong silently: every OFF `*_100g` nutrient field
used here (kcal, proteins, fat, carbohydrates, fiber, sugars) is grams except
`sodium_100g`, which is *also* grams (confirmed this session via a real product JSON:
`"sodium_unit":"g"`) despite this app's own `Macros.sodiumMg` field being milligrams
(§4.2) — see the ×1000 conversion in flat_row_to_off_food_item below. The TypeScript
side (src/search/offLiveSearch.ts) hit this exact issue as a real bug during this same
session before being caught by its own tests; documented prominently here so the same
mistake doesn't get made twice in two languages.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Union

DEFAULT_CURATED_BRANDS_PATH = Path(__file__).parent / "curated_global_brands.txt"


def load_curated_brands(path: Path = DEFAULT_CURATED_BRANDS_PATH) -> list[str]:
    """One brand per non-comment, non-blank line — see curated_global_brands.txt."""
    brands: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        brands.append(stripped)
    return brands


def is_india_or_curated_brand(
    countries_tags: Optional[Union[str, list]],
    brands: Optional[str],
    curated_brands: list[str],
) -> bool:
    """§6.1/§6.2's filter criterion, as a Python predicate — needed because delta files
    (JSON) aren't something to run the bulk import's SQL against directly.
    import_off_bulk.py's SQL is the authoritative version of "the same filter" for the
    bulk path; this is its by-hand Python equivalent for the delta path, which is
    exactly why both filters living right next to each other in one shared module
    matters (see this module's docstring).

    Brand matching is a *substring* check (case-insensitive), not exact equality,
    despite trajectory-app-technical-specification.md §6.1's own SQL sketch using
    `brands IN (...)` (exact match) — a deliberate deviation, flagged here the same way
    other spec gaps are flagged elsewhere in this codebase: OFF's `brands` field is
    frequently a comma-joined multi-brand string in practice (e.g.
    "Britannia,Britannia Industries"), and an exact-equality check against a curated
    list of single brand names like "Britannia" would silently under-match most real
    rows. import_off_bulk.py's SQL uses the equivalent ILIKE-based substring check for
    the same reason — the two are meant to agree, this docstring is the explanation for
    both.

    `countries_tags` accepts either OFF's comma-joined string convention or a JSON
    array, since which of the two a live delta file actually uses is unconfirmed from
    this sandbox (see sync_off_delta.py's module docstring) — both are handled so
    resolving that question later doesn't require touching this function.
    """
    if countries_tags:
        tags_text = (
            ",".join(str(t) for t in countries_tags)
            if isinstance(countries_tags, list)
            else str(countries_tags)
        )
        if "en:india" in tags_text.lower():
            return True
    if brands:
        brands_lower = brands.lower()
        for curated in curated_brands:
            if curated.lower() in brands_lower:
                return True
    return False


def flat_row_to_off_food_item(
    row: dict,
    *,
    id_factory=uuid.uuid4,
    synced_at: Optional[str] = None,
) -> Optional[dict]:
    """Maps one already-flattened row into an OFFFoodItem dict (§4.2). "Flattened"
    means the shape import_off_bulk.py's SQL SELECT produces directly: `code`,
    `product_name`, `brands` (nullable), `kcal_100g`, `proteins_100g`, `fat_100g`,
    `carbohydrates_100g`, `fiber_100g` (nullable), `sugars_100g` (nullable),
    `sodium_100g` (nullable, grams — see this module's docstring on the unit
    conversion). sync_off_delta.py normalizes each raw delta record into this same
    shape before calling this function, rather than this function trying to understand
    two different raw shapes itself.

    Returns None (skip, don't emit a half-valid item) if `code`/`product_name` is
    missing, or if any of the four required macros is missing — matching the same
    "missing a headline macro means untrustworthy, not zero" reasoning used at every
    other OFF/ICMR ingestion boundary in this codebase (extract_icmr.py's
    build_food_item, offLiveSearch.ts's parseHit).
    """
    code = row.get("code")
    name = row.get("product_name")
    if not code or not name or not str(name).strip():
        return None

    kcal = row.get("kcal_100g")
    protein = row.get("proteins_100g")
    fat = row.get("fat_100g")
    carb = row.get("carbohydrates_100g")
    if kcal is None or protein is None or fat is None or carb is None:
        return None

    per100g: dict[str, float] = {
        "kcal": float(kcal),
        "proteinG": float(protein),
        "fatG": float(fat),
        "carbG": float(carb),
    }
    fiber = row.get("fiber_100g")
    if fiber is not None:
        per100g["fiberG"] = float(fiber)
    sugars = row.get("sugars_100g")
    if sugars is not None:
        per100g["sugarG"] = float(sugars)
    sodium_g = row.get("sodium_100g")
    if sodium_g is not None:
        per100g["sodiumMg"] = float(sodium_g) * 1000.0  # grams -> milligrams, see docstring

    raw_brand = row.get("brands")
    brand = str(raw_brand).strip() if raw_brand else None

    return {
        "id": str(id_factory()),
        "displayName": str(name).strip(),
        "source": "off",
        "offId": str(code),
        "barcode": str(code),
        "brand": brand if brand else None,
        "lastSyncedAt": synced_at or datetime.now(timezone.utc).isoformat(),
        "per100g": per100g,
    }


def read_sync_meta(path: Path) -> dict:
    """§6.2's `read_sync_meta()`. A missing file (first-ever run) reads as "never
    synced" rather than erroring, so sync_off_delta.py's caller doesn't need a separate
    first-run code path — `days_since` naturally comes out large/undefined and the
    fortnight safety net's `else` branch (full reimport) fires, which is exactly the
    correct behavior for a first run anyway.
    """
    if not path.exists():
        return {"lastDeltaAppliedDate": None, "lastFullReimportDate": None}
    return json.loads(path.read_text(encoding="utf-8"))


def write_sync_meta(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
