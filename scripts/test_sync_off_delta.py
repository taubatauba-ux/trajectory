from __future__ import annotations

import json
from datetime import date

import pytest

from sync_off_delta import (
    DELETION_RECONCILIATION_DAYS,
    FORTNIGHT_SAFETY_NET_DAYS,
    decide_sync_action,
    extract_end_timestamp,
    filter_delta_filenames,
    flatten_delta_record,
    parse_delta_index,
    run_sync,
    upsert_off_items,
)

TODAY = date(2026, 7, 14)


class TestDecideSyncAction:
    def test_applies_deltas_when_well_within_the_window(self):
        # last_full_reimport_date must itself be recent enough to stay clear of the
        # separate 183-day deletion-reconciliation trigger below — otherwise this test
        # would fail for a reason unrelated to what it's actually checking. 2026-06-01 is
        # 43 days before TODAY, nowhere near 183.
        decision = decide_sync_action("2026-07-10", "2026-06-01", TODAY)  # 4 days, well under 13
        assert decision.action == "apply_deltas"
        assert decision.reasons == []

    def test_boundary_exactly_13_days_still_applies_deltas(self):
        # 2026-07-01 -> 2026-07-14 is exactly 13 days. §6.2: "if days_since <= 13".
        decision = decide_sync_action("2026-07-01", "2026-06-01", TODAY)
        assert decision.action == "apply_deltas"

    def test_boundary_14_days_triggers_full_reimport(self):
        decision = decide_sync_action("2026-06-30", "2026-06-01", TODAY)  # 14 days
        assert decision.action == "full_reimport"
        assert any("14 days" in r for r in decision.reasons)

    def test_never_synced_before_triggers_full_reimport(self):
        decision = decide_sync_action(None, None, TODAY)
        assert decision.action == "full_reimport"
        assert any("no prior delta sync" in r for r in decision.reasons)

    def test_deletion_reconciliation_triggers_even_with_recent_delta_sync(self):
        # Delta sync was yesterday (well within window), but full reimport hasn't
        # happened in >183 days — should still force a full reimport.
        long_ago = date(2026, 1, 1)  # 194 days before TODAY
        decision = decide_sync_action("2026-07-13", long_ago.isoformat(), TODAY)
        assert decision.action == "full_reimport"
        assert any("deletion-reconciliation" in r for r in decision.reasons)

    def test_never_had_a_full_reimport_triggers_one(self):
        decision = decide_sync_action("2026-07-13", None, TODAY)
        assert decision.action == "full_reimport"
        assert any("no prior full reimport" in r for r in decision.reasons)

    def test_both_reasons_can_co_occur_and_both_are_reported(self):
        decision = decide_sync_action(None, None, TODAY)
        assert decision.action == "full_reimport"
        assert len(decision.reasons) == 2

    def test_exactly_at_the_183_day_boundary_triggers_reimport(self):
        exactly_183_days_ago = (TODAY - date(2026, 7, 14)).days  # sanity: just confirm TODAY math below
        boundary_date = date(2026, 1, 12)  # 183 days before 2026-07-14
        assert (TODAY - boundary_date).days == 183
        decision = decide_sync_action("2026-07-13", boundary_date.isoformat(), TODAY)
        assert decision.action == "full_reimport"

    def test_one_day_short_of_the_183_day_boundary_does_not_trigger_it(self):
        boundary_minus_one = date(2026, 1, 13)  # 182 days before 2026-07-14
        assert (TODAY - boundary_minus_one).days == 182
        decision = decide_sync_action("2026-07-13", boundary_minus_one.isoformat(), TODAY)
        assert decision.action == "apply_deltas"


class TestExtractEndTimestamp:
    def test_finds_a_single_timestamp(self):
        assert extract_end_timestamp("1751500000.jsonl.gz") == 1751500000

    def test_takes_the_larger_of_two_timestamps_regardless_of_delimiter(self):
        assert extract_end_timestamp("1751400000_1751500000.jsonl.gz") == 1751500000
        assert extract_end_timestamp("1751400000-1751500000.jsonl.gz") == 1751500000

    def test_returns_none_for_no_recognizable_timestamp(self):
        assert extract_end_timestamp("readme.txt") is None
        assert extract_end_timestamp("") is None


class TestParseDeltaIndex:
    def test_splits_and_strips_lines(self):
        text = "file1.jsonl.gz\nfile2.jsonl.gz\n  file3.jsonl.gz  \n"
        assert parse_delta_index(text) == ["file1.jsonl.gz", "file2.jsonl.gz", "file3.jsonl.gz"]

    def test_ignores_blank_lines(self):
        text = "file1.jsonl.gz\n\n\nfile2.jsonl.gz\n"
        assert parse_delta_index(text) == ["file1.jsonl.gz", "file2.jsonl.gz"]

    def test_empty_index(self):
        assert parse_delta_index("") == []


class TestFilterDeltaFilenames:
    def test_keeps_files_at_or_after_since(self):
        since = date(2026, 7, 1)
        since_ts = 1782950400  # 2026-07-01T00:00:00Z, for constructing fixtures below
        filenames = [
            f"{since_ts - 100000}.jsonl.gz",  # before `since` -> excluded
            f"{since_ts + 100000}.jsonl.gz",  # after `since` -> kept
            f"{since_ts}.jsonl.gz",  # exactly at `since` -> kept
        ]
        kept = filter_delta_filenames(filenames, since)
        assert kept == [filenames[1], filenames[2]]

    def test_keeps_a_file_with_no_extractable_timestamp_rather_than_dropping_it(self):
        kept = filter_delta_filenames(["mystery-file.jsonl.gz"], date(2026, 7, 1))
        assert kept == ["mystery-file.jsonl.gz"]

    def test_preserves_input_order(self):
        # since=1990-01-01 (unix ts ~631152000) so all three fixture timestamps below
        # genuinely postdate it — 1990, not 2020, matters here: 1000000000 as a Unix
        # timestamp is 2001-09-09, which is *before* 2020-01-01, so using since=2020
        # here (an earlier version of this test did) would silently drop that file and
        # test something other than order-preservation.
        since = date(1990, 1, 1)
        filenames = ["2000000000_c.gz", "1000000000_a.gz", "3000000000_b.gz"]
        assert filter_delta_filenames(filenames, since) == filenames


class TestFlattenDeltaRecord:
    def test_extracts_nested_nutriments_into_flat_keys(self):
        raw = {
            "code": "123",
            "product_name": "Test",
            "brands": "TestBrand",
            "countries_tags": ["en:india"],
            "nutriments": {
                "energy-kcal_100g": 100,
                "proteins_100g": 5,
                "fat_100g": 2,
                "carbohydrates_100g": 10,
                "fiber_100g": 1,
                "sugars_100g": 3,
                "sodium_100g": 0.5,
            },
        }
        flat = flatten_delta_record(raw)
        assert flat == {
            "code": "123",
            "product_name": "Test",
            "brands": "TestBrand",
            "countries_tags": ["en:india"],
            "kcal_100g": 100,
            "proteins_100g": 5,
            "fat_100g": 2,
            "carbohydrates_100g": 10,
            "fiber_100g": 1,
            "sugars_100g": 3,
            "sodium_100g": 0.5,
        }

    def test_missing_nutriments_object_entirely_does_not_crash(self):
        flat = flatten_delta_record({"code": "1", "product_name": "X"})
        assert flat["kcal_100g"] is None
        assert flat["proteins_100g"] is None


class TestUpsertOffItems:
    def test_adds_a_new_item(self):
        existing = []
        updates = [{"id": "new-id", "offId": "1", "displayName": "New"}]
        result = upsert_off_items(existing, updates)
        assert result == updates

    def test_updates_an_existing_item_by_off_id(self):
        existing = [{"id": "stable-id", "offId": "1", "displayName": "Old Name", "per100g": {"kcal": 100}}]
        updates = [{"id": "freshly-minted-id", "offId": "1", "displayName": "New Name", "per100g": {"kcal": 150}}]
        result = upsert_off_items(existing, updates)
        assert len(result) == 1
        assert result[0]["displayName"] == "New Name"  # data is updated
        assert result[0]["per100g"]["kcal"] == 150
        assert result[0]["id"] == "stable-id"  # but the internal id is PRESERVED, not replaced

    def test_leaves_unrelated_existing_items_untouched(self):
        existing = [
            {"id": "id-1", "offId": "1", "displayName": "Item 1"},
            {"id": "id-2", "offId": "2", "displayName": "Item 2"},
        ]
        updates = [{"id": "fresh-id", "offId": "1", "displayName": "Item 1 Updated"}]
        result = upsert_off_items(existing, updates)
        item2 = next(i for i in result if i["offId"] == "2")
        assert item2["displayName"] == "Item 2"

    def test_multiple_updates_and_additions_together(self):
        existing = [{"id": "id-1", "offId": "1", "displayName": "Item 1"}]
        updates = [
            {"id": "x", "offId": "1", "displayName": "Item 1 Updated"},
            {"id": "y", "offId": "2", "displayName": "Item 2 New"},
        ]
        result = upsert_off_items(existing, updates)
        assert len(result) == 2
        by_off_id = {i["offId"]: i for i in result}
        assert by_off_id["1"]["id"] == "id-1"
        assert by_off_id["2"]["id"] == "y"

    def test_does_not_mutate_the_input_lists(self):
        existing = [{"id": "id-1", "offId": "1", "displayName": "Original"}]
        updates = [{"id": "x", "offId": "1", "displayName": "Changed"}]
        upsert_off_items(existing, updates)
        assert existing[0]["displayName"] == "Original"  # untouched


class TestRunSyncOrchestration:
    """Exercises run_sync end-to-end with delta_records_fetcher/bulk_importer injected
    fakes — the same testing-seam pattern as import_off_bulk.py's connection override.
    """

    def _write_meta(self, path, last_delta=None, last_full=None):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"lastDeltaAppliedDate": last_delta, "lastFullReimportDate": last_full}))

    def test_apply_deltas_path_writes_merged_seed_and_updates_meta(self, tmp_path):
        sync_meta_path = tmp_path / "sync-meta.json"
        off_seed_path = tmp_path / "off_seed.json"
        curated_brands_path = tmp_path / "brands.txt"
        curated_brands_path.write_text("Nestlé\n")

        self._write_meta(sync_meta_path, last_delta="2026-07-13", last_full="2026-06-01")
        off_seed_path.write_text(json.dumps([{"id": "existing-id", "offId": "1", "displayName": "Existing"}]))

        fake_delta_record = {
            "code": "2",
            "product_name": "New Delta Product",
            "brands": "Nestlé",
            "countries_tags": [],
            "nutriments": {
                "energy-kcal_100g": 200,
                "proteins_100g": 10,
                "fat_100g": 5,
                "carbohydrates_100g": 20,
            },
        }

        summary = run_sync(
            sync_meta_path,
            off_seed_path,
            curated_brands_path,
            parquet_url="unused",
            today=TODAY,
            delta_records_fetcher=lambda since: iter([fake_delta_record]),
        )

        assert summary["action"] == "apply_deltas"
        seed = json.loads(off_seed_path.read_text())
        assert len(seed) == 2
        assert any(i["offId"] == "2" and i["displayName"] == "New Delta Product" for i in seed)

        meta = json.loads(sync_meta_path.read_text())
        assert meta["lastDeltaAppliedDate"] == TODAY.isoformat()
        assert meta["lastFullReimportDate"] == "2026-06-01"  # untouched on the delta path

    def test_apply_deltas_path_filters_out_non_qualifying_records(self, tmp_path):
        sync_meta_path = tmp_path / "sync-meta.json"
        off_seed_path = tmp_path / "off_seed.json"
        curated_brands_path = tmp_path / "brands.txt"
        curated_brands_path.write_text("Nestlé\n")
        self._write_meta(sync_meta_path, last_delta="2026-07-13", last_full="2026-06-01")

        non_qualifying_record = {
            "code": "3",
            "product_name": "Unrelated Product",
            "brands": "Some Random Local Brand",
            "countries_tags": ["en:france"],
            "nutriments": {"energy-kcal_100g": 200, "proteins_100g": 10, "fat_100g": 5, "carbohydrates_100g": 20},
        }

        summary = run_sync(
            sync_meta_path,
            off_seed_path,
            curated_brands_path,
            parquet_url="unused",
            today=TODAY,
            delta_records_fetcher=lambda since: iter([non_qualifying_record]),
        )
        assert summary["itemsUpdated"] == 0

    def test_full_reimport_path_calls_the_injected_bulk_importer_and_updates_both_meta_fields(self, tmp_path):
        sync_meta_path = tmp_path / "sync-meta.json"
        off_seed_path = tmp_path / "off_seed.json"
        curated_brands_path = tmp_path / "brands.txt"
        curated_brands_path.write_text("Nestlé\n")
        self._write_meta(sync_meta_path, last_delta="2026-06-01", last_full="2026-01-01")  # >13 days -> reimport

        calls = []

        def fake_bulk_importer(parquet_url, curated_path, output_path):
            calls.append((parquet_url, curated_path, output_path))
            output_path.write_text("[]")
            return (42, 3)

        summary = run_sync(
            sync_meta_path,
            off_seed_path,
            curated_brands_path,
            parquet_url="https://example.test/food.parquet",
            today=TODAY,
            bulk_importer=fake_bulk_importer,
        )

        assert summary["action"] == "full_reimport"
        assert summary["itemsWritten"] == 42
        assert len(calls) == 1
        assert calls[0][0] == "https://example.test/food.parquet"

        meta = json.loads(sync_meta_path.read_text())
        assert meta["lastDeltaAppliedDate"] == TODAY.isoformat()
        assert meta["lastFullReimportDate"] == TODAY.isoformat()

    def test_first_ever_run_with_no_meta_file_triggers_full_reimport(self, tmp_path):
        sync_meta_path = tmp_path / "sync-meta.json"  # does not exist
        off_seed_path = tmp_path / "off_seed.json"
        curated_brands_path = tmp_path / "brands.txt"
        curated_brands_path.write_text("Nestlé\n")

        def fake_bulk_importer(parquet_url, curated_path, output_path):
            output_path.write_text("[]")
            return (10, 0)

        summary = run_sync(
            sync_meta_path,
            off_seed_path,
            curated_brands_path,
            parquet_url="unused",
            today=TODAY,
            bulk_importer=fake_bulk_importer,
        )
        assert summary["action"] == "full_reimport"

    def test_apply_deltas_path_with_no_existing_seed_file_starts_from_empty(self, tmp_path):
        sync_meta_path = tmp_path / "sync-meta.json"
        off_seed_path = tmp_path / "off_seed.json"  # does not exist yet
        curated_brands_path = tmp_path / "brands.txt"
        curated_brands_path.write_text("Nestlé\n")
        self._write_meta(sync_meta_path, last_delta="2026-07-13", last_full="2026-06-01")

        summary = run_sync(
            sync_meta_path,
            off_seed_path,
            curated_brands_path,
            parquet_url="unused",
            today=TODAY,
            delta_records_fetcher=lambda since: iter([]),
        )
        assert summary["totalItems"] == 0
        assert json.loads(off_seed_path.read_text()) == []
