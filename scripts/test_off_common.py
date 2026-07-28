from __future__ import annotations

import json

import pytest

from off_common import (
    flat_row_to_off_food_item,
    is_india_or_curated_brand,
    load_curated_brands,
    read_sync_meta,
    write_sync_meta,
)

CURATED = ["Nestlé", "Coca-Cola", "Britannia", "PepsiCo"]


class TestIsIndiaOrCuratedBrand:
    def test_matches_by_india_country_tag_string(self):
        assert is_india_or_curated_brand("en:france,en:india", None, CURATED) is True

    def test_matches_by_india_country_tag_list(self):
        assert is_india_or_curated_brand(["en:france", "en:india"], None, CURATED) is True

    def test_no_india_tag_and_no_curated_brand_is_excluded(self):
        assert is_india_or_curated_brand("en:france,en:germany", "Some Local Brand", CURATED) is False

    def test_matches_by_exact_curated_brand(self):
        assert is_india_or_curated_brand(None, "Britannia", CURATED) is True

    def test_matches_by_substring_within_a_multi_brand_string(self):
        # This is the case exact IN-matching (the spec's literal SQL sketch) would
        # miss — see off_common.py's docstring for why substring matching is used
        # instead.
        assert is_india_or_curated_brand(None, "Britannia,Britannia Industries", CURATED) is True

    def test_brand_match_is_case_insensitive(self):
        assert is_india_or_curated_brand(None, "britannia", CURATED) is True
        assert is_india_or_curated_brand(None, "NESTLÉ INDIA", CURATED) is True

    def test_neither_criterion_excludes(self):
        assert is_india_or_curated_brand(None, None, CURATED) is False
        assert is_india_or_curated_brand("", "", CURATED) is False

    def test_india_tag_wins_even_with_an_unrelated_brand(self):
        assert is_india_or_curated_brand("en:india", "Totally Local Brand", CURATED) is True


class TestFlatRowToOffFoodItem:
    def _row(self, **overrides):
        base = {
            "code": "8901058851226",
            "product_name": "Maggi 2-Minute Noodles Masala",
            "brands": "Maggi,Nestlé",
            "kcal_100g": 402,
            "proteins_100g": 8.7,
            "fat_100g": 16.9,
            "carbohydrates_100g": 56.7,
            "fiber_100g": 3.2,
            "sugars_100g": 8.0,
            "sodium_100g": 1.42,
        }
        base.update(overrides)
        return base

    def test_maps_a_well_formed_row(self):
        item = flat_row_to_off_food_item(
            self._row(), id_factory=lambda: "fixed-id", synced_at="2026-07-14T00:00:00Z"
        )
        assert item == {
            "id": "fixed-id",
            "displayName": "Maggi 2-Minute Noodles Masala",
            "source": "off",
            "offId": "8901058851226",
            "barcode": "8901058851226",
            "brand": "Maggi,Nestlé",
            "lastSyncedAt": "2026-07-14T00:00:00Z",
            "per100g": {
                "kcal": 402.0,
                "proteinG": 8.7,
                "fatG": 16.9,
                "carbG": 56.7,
                "fiberG": 3.2,
                "sugarG": 8.0,
                "sodiumMg": 1420.0,
            },
        }

    def test_converts_sodium_grams_to_milligrams(self):
        item = flat_row_to_off_food_item(self._row(sodium_100g=0.5))
        assert item["per100g"]["sodiumMg"] == 500.0

    def test_omits_sodium_when_not_present(self):
        row = self._row()
        del row["sodium_100g"]
        item = flat_row_to_off_food_item(row)
        assert "sodiumMg" not in item["per100g"]

    def test_omits_optional_fields_cleanly_when_absent(self):
        row = self._row()
        del row["fiber_100g"]
        del row["sugars_100g"]
        del row["sodium_100g"]
        item = flat_row_to_off_food_item(row)
        assert item["per100g"] == {"kcal": 402.0, "proteinG": 8.7, "fatG": 16.9, "carbG": 56.7}

    def test_skips_row_missing_code(self):
        row = self._row()
        del row["code"]
        assert flat_row_to_off_food_item(row) is None

    def test_skips_row_missing_product_name(self):
        row = self._row()
        del row["product_name"]
        assert flat_row_to_off_food_item(row) is None

    def test_skips_row_with_blank_product_name(self):
        assert flat_row_to_off_food_item(self._row(product_name="   ")) is None

    @pytest.mark.parametrize("field", ["kcal_100g", "proteins_100g", "fat_100g", "carbohydrates_100g"])
    def test_skips_row_missing_a_required_macro(self, field):
        row = self._row()
        del row[field]
        assert flat_row_to_off_food_item(row) is None

    def test_handles_a_row_with_no_brand(self):
        row = self._row()
        del row["brands"]
        item = flat_row_to_off_food_item(row)
        assert item["brand"] is None

    def test_mints_a_fresh_id_by_default(self):
        item_a = flat_row_to_off_food_item(self._row(code="111"))
        item_b = flat_row_to_off_food_item(self._row(code="222"))
        assert item_a["id"] != item_b["id"]
        assert len(item_a["id"]) > 0


class TestSyncMeta:
    def test_missing_file_reads_as_never_synced(self, tmp_path):
        meta = read_sync_meta(tmp_path / "sync-meta.json")
        assert meta == {"lastDeltaAppliedDate": None, "lastFullReimportDate": None}

    def test_round_trips(self, tmp_path):
        path = tmp_path / "nested" / "sync-meta.json"
        write_sync_meta(path, {"lastDeltaAppliedDate": "2026-07-01", "lastFullReimportDate": "2026-06-01"})
        assert read_sync_meta(path) == {
            "lastDeltaAppliedDate": "2026-07-01",
            "lastFullReimportDate": "2026-06-01",
        }

    def test_written_file_is_readable_json(self, tmp_path):
        path = tmp_path / "sync-meta.json"
        write_sync_meta(path, {"a": 1})
        assert json.loads(path.read_text()) == {"a": 1}


class TestLoadCuratedBrands:
    def test_loads_real_file_and_ignores_comments_and_blanks(self, tmp_path):
        path = tmp_path / "brands.txt"
        path.write_text("# comment\n\nNestlé\nBritannia\n  \n# another comment\nPepsiCo\n")
        assert load_curated_brands(path) == ["Nestlé", "Britannia", "PepsiCo"]

    def test_default_path_file_exists_and_is_non_empty(self):
        # Exercises the real curated_global_brands.txt shipped alongside these scripts.
        brands = load_curated_brands()
        assert len(brands) > 5
        assert "Nestlé" in brands or "Nestle" in brands
