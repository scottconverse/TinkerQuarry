from types import SimpleNamespace

from kimcad.reverse_import import (
    geometry_signature_matches,
    match_known_families_from_bbox,
    match_known_family_from_bbox,
    plan_from_match,
)
from kimcad.templates import default_registry


def test_bbox_ties_return_every_candidate_family_ranked():
    """QA-1 (gate 2026-07-09): a 20x20x30 envelope ties MANY families (solid cylinder, hollow
    box, tray...). The old single-winner API returned whichever registered first (snap_box) and
    the import path never tried the rest — rejecting a dowel pin on its own textbook shape. The
    candidate list must contain dowel_pin so the signature loop can reach it."""
    candidates = match_known_families_from_bbox((20.0, 20.0, 30.0))

    names = [m.family.name for m in candidates]
    assert len(candidates) > 1, "shared envelope must yield multiple candidates"
    assert "dowel_pin" in names, f"dowel_pin missing from tied candidates: {names}"
    assert all(
        candidates[i].score_mm <= candidates[i + 1].score_mm for i in range(len(candidates) - 1)
    ), "candidates must be ranked best-first"
    # The single-winner wrapper stays consistent with the head of the ranked list.
    single = match_known_family_from_bbox((20.0, 20.0, 30.0))
    assert single is not None and single.family.name == names[0]


def test_bbox_no_match_returns_empty_list():
    assert match_known_families_from_bbox((0.4, 0.4, 0.4)) == []
    assert match_known_families_from_bbox((float("nan"), 10.0, 10.0)) == []


def test_reverse_import_matches_direct_bbox_template_family():
    family = default_registry().family("snap_box")
    values = {"width": 92.0, "depth": 54.0, "height": 31.0, "wall": 2.0}
    expected = family.expected_bbox(values)

    match = match_known_family_from_bbox(expected)

    assert match is not None
    assert match.family.name == "snap_box"
    assert match.values["width"] == 92.0
    assert match.values["depth"] == 54.0
    assert match.values["height"] == 31.0
    assert match.confidence > 0.95


def test_reverse_import_plan_discloses_geometry_signature_assumption():
    family = default_registry().family("snap_box")
    match = match_known_family_from_bbox(family.expected_bbox({"width": 80, "depth": 60, "height": 40, "wall": 2}))

    plan = plan_from_match(match, "fixture.stl")

    assert plan.summary.startswith("Reverse-imported")
    assert plan.bounding_box_mm == [80.0, 60.0, 40.0]
    assert any("bounding box" in assumption for assumption in plan.assumptions)
    assert any("volume/surface" in assumption for assumption in plan.assumptions)


def test_reverse_import_rejects_bbox_only_false_positive():
    imported = SimpleNamespace(volume_mm3=100_000.0, surface_area_mm2=20_000.0)
    rebuilt = SimpleNamespace(volume_mm3=52_000.0, surface_area_mm2=11_000.0)

    check = geometry_signature_matches(imported, rebuilt)

    assert not check.ok
    assert check.volume_delta is not None and check.volume_delta > 0.08
    assert check.surface_delta is not None and check.surface_delta > 0.18
    assert check.reasons


def test_reverse_import_accepts_matching_geometry_signature():
    imported = SimpleNamespace(volume_mm3=100_000.0, surface_area_mm2=20_000.0)
    rebuilt = SimpleNamespace(volume_mm3=96_000.0, surface_area_mm2=18_500.0)

    check = geometry_signature_matches(imported, rebuilt)

    assert check.ok
