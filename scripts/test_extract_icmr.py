"""Tests for extract_icmr.py's pure functions only — normalize_cell,
is_probable_data_row, assign_ifct_codes, build_food_item, validate_extraction. These
run against synthetic rows constructed to match extract_icmr.py's own documented
column-mapping assumptions, NOT the real IFCT2017 PDF (this sandbox cannot reach
nin.res.in — see extract_icmr.py's module docstring for the full explanation). A green
run here means "the logic is correct given the assumed input shape", not "this has been
validated against the real book" — those are different claims and this suite only
makes the first one.
"""

from __future__ import annotations

import json

import pytest

from extract_icmr import (
    EXPECTED_TOTAL_FOODS,
    ExtractedRow,
    GROUP_SPEC,
    assign_ifct_codes,
    build_food_item,
    is_probable_data_row,
    normalize_cell,
    validate_extraction,
)


class TestNormalizeCell:
    def test_trace_value(self):
        value, was_trace = normalize_cell("Tr")
        assert value == 0.0
        assert was_trace is True

    def test_trace_value_case_and_whitespace_insensitive(self):
        for raw in ("tr", " Tr ", "TRACE", "trace"):
            value, was_trace = normalize_cell(raw)
            assert value == 0.0
            assert was_trace is True

    def test_dash_means_not_analyzed(self):
        value, was_trace = normalize_cell("-")
        assert value is None
        assert was_trace is False

    def test_blank_means_not_analyzed(self):
        assert normalize_cell("") == (None, False)
        assert normalize_cell("   ") == (None, False)
        assert normalize_cell(None) == (None, False)

    def test_ordinary_numeric_value(self):
        value, was_trace = normalize_cell("28.2")
        assert value == 28.2
        assert was_trace is False

    def test_strips_whitespace_and_thousands_separator(self):
        assert normalize_cell(" 1,234.5 ") == (1234.5, False)

    def test_zero_is_a_real_value_not_missing(self):
        # Distinct from "-"/blank: an actual measured 0 should NOT be treated as
        # "not analyzed" — e.g. carbG=0 for a pure-fat/protein food is a real fact.
        assert normalize_cell("0") == (0.0, False)

    def test_unparseable_raises(self):
        with pytest.raises(ValueError):
            normalize_cell("not-a-number")


class TestIsProbableDataRow:
    def _row(self, **overrides):
        base = {
            "food_name": "Rice, raw, milled",
            "moisture": "12.0",
            "protein": "6.8",
            "fat": "0.5",
            "carbohydrate": "78.2",
            "fibre": "0.2",
            "ash": "0.6",
            "energy": "345",
        }
        base.update(overrides)
        return base

    def test_well_formed_row_is_data(self):
        assert is_probable_data_row(self._row()) is True

    def test_empty_food_name_is_not_data(self):
        assert is_probable_data_row(self._row(food_name="")) is False
        assert is_probable_data_row(self._row(food_name="   ")) is False

    def test_repeated_header_row_is_not_data(self):
        assert is_probable_data_row(self._row(food_name="Food Name")) is False
        assert is_probable_data_row(self._row(food_name="foods")) is False

    def test_section_heading_with_no_numeric_cells_is_not_data(self):
        heading = self._row(
            food_name="CEREALS & MILLETS",
            moisture="-",
            protein="-",
            fat="-",
            carbohydrate="-",
            fibre="-",
            ash="-",
            energy="-",
        )
        assert is_probable_data_row(heading) is False

    def test_row_with_several_unanalyzed_fields_is_still_data(self):
        # A real food can legitimately have several "-" fields without being a heading —
        # the threshold should tolerate sparse-but-real rows.
        sparse = self._row(fibre="-", ash="-")
        assert is_probable_data_row(sparse) is True

    def test_threshold_is_configurable(self):
        borderline = self._row(moisture="-", fibre="-", ash="-")  # 4 numeric cells left
        assert is_probable_data_row(borderline, min_numeric_cells=3) is True
        assert is_probable_data_row(borderline, min_numeric_cells=5) is False


class TestAssignIfctCodes:
    def _row(self, name, group, printed_code=None):
        return ExtractedRow(
            food_name=name,
            group=group,
            printed_code=printed_code,
            moisture=10.0,
            protein=5.0,
            fat=1.0,
            carbohydrate=20.0,
            fibre=1.0,
            ash=1.0,
            energy=150.0,
        )

    def test_generates_sequential_codes_within_a_group(self):
        rows = [
            self._row("Rice", "Cereals & millets"),
            self._row("Wheat", "Cereals & millets"),
            self._row("Maize", "Cereals & millets"),
        ]
        codes = assign_ifct_codes(rows)
        assert codes[0] == "CM001"
        assert codes[1] == "CM002"
        assert codes[2] == "CM003"

    def test_uses_printed_code_verbatim_when_present(self):
        rows = [self._row("Rice", "Cereals & millets", printed_code="A007")]
        assert assign_ifct_codes(rows)[0] == "A007"

    def test_sequences_are_independent_per_group_even_when_interleaved(self):
        rows = [
            self._row("Rice", "Cereals & millets"),
            self._row("Mango", "Fruits"),
            self._row("Wheat", "Cereals & millets"),
            self._row("Banana", "Fruits"),
        ]
        codes = assign_ifct_codes(rows)
        assert codes[0] == "CM001"
        assert codes[1] == "FR001"
        assert codes[2] == "CM002"
        assert codes[3] == "FR002"

    def test_mixed_printed_and_generated_codes_in_the_same_group(self):
        rows = [
            self._row("Rice", "Cereals & millets", printed_code="A001"),
            self._row("Wheat", "Cereals & millets"),  # falls back to generated
        ]
        codes = assign_ifct_codes(rows)
        assert codes[0] == "A001"
        assert codes[1] == "CM001"  # sequence starts at 1 regardless of the printed one

    def test_unrecognized_group_raises(self):
        rows = [self._row("Mystery food", "Not A Real Group")]
        with pytest.raises(ValueError, match="unrecognized group"):
            assign_ifct_codes(rows)

    def test_every_group_prefix_is_unique(self):
        prefixes = [g.prefix for g in GROUP_SPEC]
        assert len(prefixes) == len(set(prefixes))


class TestBuildFoodItem:
    def test_maps_required_fields(self):
        row = ExtractedRow(
            food_name="Rice, raw, milled",
            group="Cereals & millets",
            printed_code=None,
            moisture=12.0,
            protein=6.8,
            fat=0.5,
            carbohydrate=78.2,
            fibre=0.2,
            ash=0.6,
            energy=345.0,
        )
        item = build_food_item(row, "CM001", id_factory=lambda: "fixed-id")
        assert item == {
            "id": "fixed-id",
            "displayName": "Rice, raw, milled",
            "source": "icmr",
            "ifctCode": "CM001",
            "foodGroup": "Cereals & millets",
            "per100g": {
                "kcal": 345.0,
                "proteinG": 6.8,
                "fatG": 0.5,
                "carbG": 78.2,
                "fiberG": 0.2,
            },
        }

    def test_omits_fiberG_when_fibre_not_analyzed(self):
        row = ExtractedRow(
            food_name="Test food",
            group="Fruits",
            printed_code=None,
            moisture=10.0,
            protein=1.0,
            fat=0.1,
            carbohydrate=10.0,
            fibre=None,  # "-" in the source
            ash=0.5,
            energy=50.0,
        )
        item = build_food_item(row, "FR001", id_factory=lambda: "x")
        assert "fiberG" not in item["per100g"]

    def test_does_not_carry_moisture_or_ash_into_the_shipped_item(self):
        row = ExtractedRow(
            food_name="Test food",
            group="Fruits",
            printed_code=None,
            moisture=88.0,
            protein=1.0,
            fat=0.1,
            carbohydrate=10.0,
            fibre=1.0,
            ash=0.5,
            energy=50.0,
        )
        item = build_food_item(row, "FR001", id_factory=lambda: "x")
        assert "moisture" not in item["per100g"]
        assert "ash" not in item["per100g"]

    @pytest.mark.parametrize("missing_field", ["energy", "protein", "fat", "carbohydrate"])
    def test_raises_when_a_required_macro_is_missing(self, missing_field):
        kwargs = dict(
            food_name="Broken row",
            group="Fruits",
            printed_code=None,
            moisture=10.0,
            protein=1.0,
            fat=0.1,
            carbohydrate=10.0,
            fibre=1.0,
            ash=0.5,
            energy=50.0,
        )
        kwargs[missing_field] = None
        row = ExtractedRow(**kwargs)
        with pytest.raises(ValueError, match="missing a required macro"):
            build_food_item(row, "FR001")


class TestValidateExtraction:
    def _make_rows(self, counts: dict[str, int]) -> list[ExtractedRow]:
        rows = []
        for group, n in counts.items():
            for i in range(n):
                rows.append(
                    ExtractedRow(
                        food_name=f"{group} food {i}",
                        group=group,
                        printed_code=None,
                        moisture=10.0,
                        protein=1.0,
                        fat=0.1,
                        carbohydrate=10.0,
                        fibre=1.0,
                        ash=0.5,
                        energy=50.0,
                    )
                )
        return rows

    def test_exact_expected_counts_pass(self):
        counts = {g.name: g.expected_count for g in GROUP_SPEC}
        report = validate_extraction(self._make_rows(counts))
        assert report.ok is True
        assert report.total_actual == EXPECTED_TOTAL_FOODS
        assert report.group_mismatches == []

    def test_short_group_is_flagged_by_name(self):
        counts = {g.name: g.expected_count for g in GROUP_SPEC}
        counts["Fruits"] = counts["Fruits"] - 3  # simulate 3 missed rows
        report = validate_extraction(self._make_rows(counts))
        assert report.ok is False
        assert {"group": "Fruits", "expected": 68, "actual": 65} in report.group_mismatches
        # Unaffected groups shouldn't show up as mismatches at all.
        assert not any(m["group"] == "Cereals & millets" for m in report.group_mismatches)

    def test_over_count_group_is_also_flagged(self):
        counts = {g.name: g.expected_count for g in GROUP_SPEC}
        counts["Sugars"] = counts["Sugars"] + 1
        report = validate_extraction(self._make_rows(counts))
        assert report.ok is False
        assert {"group": "Sugars", "expected": 2, "actual": 3} in report.group_mismatches

    def test_empty_input(self):
        report = validate_extraction([])
        assert report.ok is False
        assert report.total_actual == 0
        assert len(report.group_mismatches) == len(GROUP_SPEC)  # every group is "missing"


class TestRunExtractionOrchestration:
    """Exercises run_extraction end-to-end — normalize -> filter -> assign codes ->
    build items -> write JSON — with extract_table1_with_pdfplumber monkeypatched to
    return synthetic raw rows instead of touching a real PDF. This is the one place a
    wiring bug between the individually-correct pure functions above would show up
    (e.g. a field name mismatch between what one function returns and the next
    expects), which per-function unit tests can't catch on their own.
    """

    def test_writes_valid_items_and_meta_json(self, tmp_path, monkeypatch):
        import extract_icmr

        synthetic_raw_rows = [
            # A normal header row that should be dropped.
            {
                "printed_code": None,
                "food_name": "Food Name",
                "group": "Cereals & millets",
                "moisture": None,
                "protein": None,
                "fat": None,
                "carbohydrate": None,
                "fibre": None,
                "ash": None,
                "energy": None,
            },
            {
                "printed_code": None,
                "food_name": "Rice, raw, milled",
                "group": "Cereals & millets",
                "moisture": "12.0",
                "protein": "6.8",
                "fat": "0.5",
                "carbohydrate": "78.2",
                "fibre": "0.2",
                "ash": "0.6",
                "energy": "345",
            },
            {
                "printed_code": None,
                "food_name": "Wheat flour, whole",
                "group": "Cereals & millets",
                "moisture": "11.0",
                "protein": "12.1",
                "fat": "Tr",  # trace amount
                "carbohydrate": "69.4",
                "fibre": "-",  # not analyzed -> omitted, not zero
                "ash": "1.5",
                "energy": "341",
            },
        ]

        monkeypatch.setattr(
            extract_icmr, "extract_table1_with_pdfplumber", lambda pdf_path: synthetic_raw_rows
        )

        fake_pdf = tmp_path / "fake.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4 fake content for hashing purposes")
        output_dir = tmp_path / "out"

        report = extract_icmr.run_extraction(fake_pdf, output_dir)

        # Header row correctly dropped, both real rows kept.
        assert report.total_actual == 2

        items = json.loads((output_dir / "icmr_ifct2017.json").read_text())
        assert len(items) == 2

        rice = next(i for i in items if i["displayName"] == "Rice, raw, milled")
        assert rice["ifctCode"] == "CM001"
        assert rice["per100g"] == {"kcal": 345.0, "proteinG": 6.8, "fatG": 0.5, "carbG": 78.2, "fiberG": 0.2}

        wheat = next(i for i in items if i["displayName"] == "Wheat flour, whole")
        assert wheat["ifctCode"] == "CM002"
        assert wheat["per100g"]["fatG"] == 0.0  # "Tr" normalized to 0.0
        assert "fiberG" not in wheat["per100g"]  # "-" omitted, not zeroed

        meta = json.loads((output_dir / "icmr.meta.json").read_text())
        assert meta["rowCount"] == 2
        assert meta["expectedRowCount"] == 528
        assert meta["sourcePdfSha256"] == extract_icmr.sha256_hex(fake_pdf.read_bytes())
        assert len(meta["groupMismatches"]) > 0  # 2 rows vs. 24 expected for this group — correctly flagged

    def test_raises_nothing_and_still_writes_output_even_when_counts_mismatch(self, tmp_path, monkeypatch):
        # run_extraction itself should not raise on a mismatch (that's main()'s job, via
        # the exit code) — it should still write what it found, just report=not ok.
        import extract_icmr

        monkeypatch.setattr(extract_icmr, "extract_table1_with_pdfplumber", lambda pdf_path: [])
        fake_pdf = tmp_path / "fake.pdf"
        fake_pdf.write_bytes(b"irrelevant")
        report = extract_icmr.run_extraction(fake_pdf, tmp_path / "out")
        assert report.ok is False
        assert (tmp_path / "out" / "icmr_ifct2017.json").exists()
