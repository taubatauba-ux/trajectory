"""Tests for import_off_bulk.py that run the REAL SQL from build_query() through a REAL
DuckDB connection — against a small synthetic in-memory table standing in for
`read_parquet(huggingface_url)`, not against the actual 4.6-million-row dataset (this
sandbox cannot reach huggingface.co — see import_off_bulk.py's module docstring). A
green run here means the query's filter/join/column-mapping logic is correct given a
table with this schema; it is NOT confirmation the real Parquet file's schema actually
matches what's assumed (see that same docstring for what a first real run needs to
re-verify).
"""

from __future__ import annotations

import json

import duckdb
import pytest

from import_off_bulk import build_query, run_bulk_import

SYNTHETIC_SCHEMA_SQL = """
CREATE TABLE synthetic_products (
    code VARCHAR,
    product_name VARCHAR,
    brands VARCHAR,
    countries_tags VARCHAR,
    "energy-kcal_100g" DOUBLE,
    proteins_100g DOUBLE,
    fat_100g DOUBLE,
    carbohydrates_100g DOUBLE,
    fiber_100g DOUBLE,
    sugars_100g DOUBLE,
    sodium_100g DOUBLE,
    serving_size VARCHAR
)
"""


@pytest.fixture
def con():
    connection = duckdb.connect()
    connection.execute(SYNTHETIC_SCHEMA_SQL)
    connection.execute("CREATE TABLE curated_global_brands (brand VARCHAR)")
    connection.executemany(
        "INSERT INTO curated_global_brands VALUES (?)", [("Nestlé",), ("Britannia",)]
    )
    yield connection
    connection.close()


def insert_product(
    con,
    code="0000",
    product_name="Test Product",
    brands=None,
    countries_tags=None,
    kcal=100.0,
    protein=5.0,
    fat=2.0,
    carb=15.0,
    fiber=None,
    sugar=None,
    sodium=None,
    serving_size=None,
):
    con.execute(
        "INSERT INTO synthetic_products VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [code, product_name, brands, countries_tags, kcal, protein, fat, carb, fiber, sugar, sodium, serving_size],
    )


class TestBuildQueryAgainstSyntheticData:
    def test_includes_a_row_tagged_india(self, con):
        insert_product(con, code="1", countries_tags="en:france,en:india")
        result = con.execute(build_query("synthetic_products")).df()
        assert list(result["code"]) == ["1"]

    def test_excludes_a_row_with_no_india_tag_and_no_curated_brand(self, con):
        insert_product(con, code="1", countries_tags="en:france", brands="Some Local Brand")
        result = con.execute(build_query("synthetic_products")).df()
        assert len(result) == 0

    def test_includes_a_row_by_exact_curated_brand(self, con):
        insert_product(con, code="1", countries_tags="en:france", brands="Britannia")
        result = con.execute(build_query("synthetic_products")).df()
        assert list(result["code"]) == ["1"]

    def test_includes_a_row_by_curated_brand_as_a_substring_of_a_multi_brand_field(self, con):
        # This is exactly the case the spec's own literal `brands IN (...)` sketch would
        # miss — see off_common.py's is_india_or_curated_brand docstring.
        insert_product(con, code="1", brands="Britannia,Britannia Industries Ltd")
        result = con.execute(build_query("synthetic_products")).df()
        assert list(result["code"]) == ["1"]

    def test_brand_match_is_case_insensitive(self, con):
        insert_product(con, code="1", brands="NESTLÉ INDIA")
        result = con.execute(build_query("synthetic_products")).df()
        assert list(result["code"]) == ["1"]

    def test_excludes_a_qualifying_row_missing_a_required_macro(self, con):
        # Tagged India (would otherwise qualify) but fat is NULL — the NOT NULL filter
        # should still exclude it.
        insert_product(con, code="1", countries_tags="en:india", fat=None)
        result = con.execute(build_query("synthetic_products")).df()
        assert len(result) == 0

    def test_renames_energy_kcal_100g_to_kcal_100g(self, con):
        insert_product(con, code="1", countries_tags="en:india", kcal=345.0)
        result = con.execute(build_query("synthetic_products")).df()
        assert "kcal_100g" in result.columns
        assert "energy-kcal_100g" not in result.columns
        assert result.iloc[0]["kcal_100g"] == 345.0

    def test_multiple_curated_brands_all_work(self, con):
        insert_product(con, code="1", brands="Nestlé")
        insert_product(con, code="2", brands="Britannia")
        insert_product(con, code="3", brands="Unrelated Local Co")
        result = con.execute(build_query("synthetic_products")).df()
        assert set(result["code"]) == {"1", "2"}

    def test_a_row_qualifying_by_both_criteria_appears_once_not_twice(self, con):
        insert_product(con, code="1", countries_tags="en:india", brands="Britannia")
        result = con.execute(build_query("synthetic_products")).df()
        assert len(result) == 1


class TestRunBulkImportEndToEnd:
    """Exercises the full pipeline — SQL -> fetch -> flat_row_to_off_food_item -> JSON
    file — using the same synthetic-table seam as above, via run_bulk_import's
    source_sql/connection override parameters.
    """

    def test_writes_a_valid_off_food_item_array(self, tmp_path, con):
        insert_product(
            con,
            code="8901058851226",
            product_name="Maggi 2-Minute Noodles Masala",
            brands="Maggi,Nestlé",
            countries_tags="en:india",
            kcal=402.0,
            protein=8.7,
            fat=16.9,
            carb=56.7,
            fiber=3.2,
            sodium=1.42,
        )
        output_path = tmp_path / "off_seed.json"

        written, skipped = run_bulk_import(
            parquet_url="unused",
            curated_brands_path=tmp_path / "unused.txt",
            output_path=output_path,
            source_sql="synthetic_products",
            connection=con,
        )

        assert written == 1
        assert skipped == 0
        items = json.loads(output_path.read_text())
        assert len(items) == 1
        item = items[0]
        assert item["displayName"] == "Maggi 2-Minute Noodles Masala"
        assert item["source"] == "off"
        assert item["offId"] == "8901058851226"
        assert item["per100g"]["kcal"] == 402.0
        assert item["per100g"]["sodiumMg"] == 1420.0  # grams -> mg conversion applied

    def test_excludes_non_qualifying_rows_from_the_written_file(self, tmp_path, con):
        insert_product(con, code="1", countries_tags="en:india")
        insert_product(con, code="2", countries_tags="en:france", brands="Unrelated")
        output_path = tmp_path / "off_seed.json"
        written, _ = run_bulk_import(
            parquet_url="unused",
            curated_brands_path=tmp_path / "unused.txt",
            output_path=output_path,
            source_sql="synthetic_products",
            connection=con,
        )
        assert written == 1
        items = json.loads(output_path.read_text())
        assert items[0]["offId"] == "1"

    def test_creates_parent_directories_for_the_output_path(self, tmp_path, con):
        insert_product(con, code="1", countries_tags="en:india")
        output_path = tmp_path / "nested" / "dir" / "off_seed.json"
        run_bulk_import(
            parquet_url="unused",
            curated_brands_path=tmp_path / "unused.txt",
            output_path=output_path,
            source_sql="synthetic_products",
            connection=con,
        )
        assert output_path.exists()

    def test_empty_result_set_writes_an_empty_json_array_not_an_error(self, tmp_path, con):
        output_path = tmp_path / "off_seed.json"
        written, skipped = run_bulk_import(
            parquet_url="unused",
            curated_brands_path=tmp_path / "unused.txt",
            output_path=output_path,
            source_sql="synthetic_products",
            connection=con,
        )
        assert written == 0
        assert json.loads(output_path.read_text()) == []
