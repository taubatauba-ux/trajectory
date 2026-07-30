#!/usr/bin/env python3
"""§6.1 One-time filtered bulk import — trajectory-app-technical-specification.md.

Produces src/data/off/off_seed.json (an array of OFFFoodItem, §4.2) by querying OFF's
own Parquet export directly over HTTPS via DuckDB — no multi-gigabyte download, per the
spec's own reasoning (DuckDB's `read_parquet` can push predicates down and only pull the
matching rows/columns over the wire).

WHAT'S VERIFIED VS. NOT
--------------------------------------------------------------------------------
Verified this session (web search, July 2026): the Parquet export URL below
(DEFAULT_PARQUET_URL) is the one OFF's own current documentation points to for bulk
reuse, independently of trajectory-app-technical-specification.md already stating the
same URL. Column names for the four required macros (energy-kcal_100g, proteins_100g,
fat_100g, carbohydrates_100g) and the optional ones (fiber_100g, sugars_100g,
sodium_100g) match OFF's standard nutriment naming convention, used consistently
elsewhere across their API surface. The sodium unit conversion (grams -> milligrams) in
off_common.py's flat_row_to_off_food_item is verified via a real product JSON example.

NOT verified: this sandbox's network allowlist blocks huggingface.co outright
(confirmed: `curl -I` -> `403 host_not_allowed`), matching the app spec's own note that
its authors hit the same restriction — so nobody in this session has run this query
against the real 4.6-million-row file. What COULD be verified without network access —
the SQL's actual filter/join/column-mapping logic — is: see build_query below and
test_import_off_bulk.py, which runs this exact query (same WHERE clause, same EXISTS
subquery, same column renaming) against a small synthetic in-memory DuckDB table with
the same schema shape, standing in for `read_parquet(...)`. A green run there means the
SQL itself is correct given that schema; it does NOT confirm the real Parquet file's
schema actually matches what's assumed here (column names, types, and whether
`countries_tags` is really a LIKE-able string — see off_common.py's docstring). First
real run's row count and a handful of spot-checked products are the actual confirmation
of that; treat this script's first live run as a schema-verification step, not just a
data pull.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from off_common import DEFAULT_CURATED_BRANDS_PATH, flat_row_to_off_food_item, load_curated_brands

DEFAULT_PARQUET_URL = (
    "https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet"
)

# Columns pulled from the source, and their renaming — matches
# trajectory-app-technical-specification.md §6.1's own SQL sketch exactly for the
# SELECT list (this part isn't in dispute); the WHERE clause below deliberately
# diverges from that sketch's `brands IN (...)` in favor of a substring/case-insensitive
# EXISTS check — see off_common.py's is_india_or_curated_brand docstring for why.
SELECT_COLUMNS_SQL = """SELECT code, product_name, brands,
       "energy-kcal_100g" AS kcal_100g, proteins_100g, carbohydrates_100g,
       fat_100g, fiber_100g, sugars_100g, sodium_100g, serving_size"""


def build_query(source_sql: str) -> str:
    """`source_sql` is the FROM-clause target: `read_parquet('https://...')` in
    production, a synthetic local table name in tests. Keeping this as a parameter
    (rather than baking the URL directly into the query string) is what makes the
    filter/column-mapping logic below testable against a small local fixture without
    needing network access to the real dataset — see test_import_off_bulk.py.

    Assumes `curated_global_brands` already exists as a table in the same connection
    (see run_bulk_import) — a VARCHAR column named `brand`, one row per curated brand.

    The four required macros are filtered NOT NULL here, in SQL, rather than left for
    Python post-processing to discard — off_common.py's flat_row_to_off_food_item
    would skip them anyway (belt-and-suspenders: the same "missing headline macro
    means untrustworthy" rule enforced at two layers isn't a contradiction, it's cheap
    insurance against one layer's check being edited later without noticing it was the
    only one).
    """
    return f"""
        {SELECT_COLUMNS_SQL}
        FROM {source_sql}
        WHERE (
            list_contains(countries_tags, 'en:india')
            OR EXISTS (
                SELECT 1 FROM curated_global_brands cb
                WHERE brands ILIKE '%' || cb.brand || '%'
            )
        )
        AND "energy-kcal_100g" IS NOT NULL
        AND proteins_100g IS NOT NULL
        AND fat_100g IS NOT NULL
        AND carbohydrates_100g IS NOT NULL
    """


def run_bulk_import(
    parquet_url: str,
    curated_brands_path: Path,
    output_path: Path,
    *,
    source_sql: str | None = None,
    connection=None,
) -> tuple[int, int]:
    """Returns (items_written, rows_skipped_after_sql_filter). The latter should
    normally be 0 given the SQL's own NOT NULL filter — a positive number here would
    mean flat_row_to_off_food_item rejected something SQL let through (e.g. a blank
    product_name that isn't SQL NULL), worth a second look if it happens on a real run.

    `source_sql` and `connection` are testing seams: production leaves both as their
    defaults (builds `read_parquet(parquet_url)` on a fresh connection);
    test_import_off_bulk.py passes a synthetic in-memory table name and an
    already-populated connection, so the *entire* pipeline — SQL, fetch, row mapping,
    JSON writing — runs for real in tests, not just the SQL string in isolation.
    """
    import duckdb  # deferred import, consistent with extract_icmr.py's pattern —
    # keeps build_query importable with zero optional dependencies for anyone just
    # running the test suite.

    owns_connection = connection is None
    con = connection if connection is not None else duckdb.connect()
    try:
        if owns_connection:
            brands = load_curated_brands(curated_brands_path)
            con.execute("CREATE TABLE curated_global_brands (brand VARCHAR)")
            con.executemany("INSERT INTO curated_global_brands VALUES (?)", [(b,) for b in brands])

        query = build_query(source_sql or f"read_parquet('{parquet_url}')")
        rows = con.execute(query).df().to_dict("records")

        items = []
        skipped = 0
        for row in rows:
            item = flat_row_to_off_food_item(row)
            if item is None:
                skipped += 1
                continue
            items.append(item)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return len(items), skipped
    finally:
        if owns_connection:
            con.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parquet-url", default=DEFAULT_PARQUET_URL)
    parser.add_argument("--curated-brands", type=Path, default=DEFAULT_CURATED_BRANDS_PATH)
    parser.add_argument("--output", type=Path, default=Path("src/data/off/off_seed.json"))
    args = parser.parse_args()

    print(f"Querying {args.parquet_url} via DuckDB (this may take a few minutes)...")
    written, skipped = run_bulk_import(args.parquet_url, args.curated_brands, args.output)
    print(f"Wrote {written} OFF foods to {args.output} ({skipped} matched rows skipped — see module docstring)")
    if written == 0:
        print("WARNING: zero items written — almost certainly a schema mismatch, not an empty dataset. See this script's module docstring.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
