"""Reverse-import helpers for known parametric template families.

This is intentionally conservative: an imported triangle mesh is not editable CAD by
itself. We measure it, match that envelope against known template families, then
rebuild the closest trusted family as parametric OpenSCAD/STEP-capable geometry.
"""

from __future__ import annotations

from dataclasses import dataclass
import math

from kimcad.ir import DesignPlan
from kimcad.templates import (
    TemplateFamily,
    TemplateRegistry,
    clamp_values,
    default_registry,
)


@dataclass(frozen=True)
class ReverseImportMatch:
    family: TemplateFamily
    values: dict[str, float]
    expected_bbox_mm: tuple[float, float, float]
    measured_bbox_mm: tuple[float, float, float]
    score_mm: float
    confidence: float


@dataclass(frozen=True)
class GeometrySignatureCheck:
    ok: bool
    volume_delta: float | None
    surface_delta: float | None
    reasons: tuple[str, ...] = ()


def match_known_families_from_bbox(
    bbox_mm: tuple[float, float, float],
    registry: TemplateRegistry | None = None,
) -> list[ReverseImportMatch]:
    """All template families whose analytic bounding box fits the measured one, best first.

    A bounding box alone cannot pick between families that share an envelope (a solid
    cylinder, a hollow box, and a tray can all measure 20x20x30) — ties at the same score
    used to be broken by registration order, which made the matcher reject a dowel pin
    because ``snap_box`` was registered first (gate 2026-07-09, QA-1). Callers verify the
    mesh-scale geometry signature per candidate and keep the first that agrees, so this
    returns the full ranked candidate list, one best entry per family.
    """

    if len(bbox_mm) != 3 or any((not math.isfinite(v) or v <= 0) for v in bbox_mm):
        return []

    reg = registry or default_registry()
    matches: list[ReverseImportMatch] = []
    for family in reg.families():
        best_for_family: ReverseImportMatch | None = None
        for values in _candidate_values(family, bbox_mm):
            expected = family.expected_bbox(values)
            score = _bbox_score(bbox_mm, expected)
            tolerance = _match_tolerance(bbox_mm, expected)
            if score > tolerance:
                continue
            confidence = max(0.0, min(1.0, 1.0 - (score / max(tolerance, 0.001))))
            match = ReverseImportMatch(
                family=family,
                values=values,
                expected_bbox_mm=expected,
                measured_bbox_mm=bbox_mm,
                score_mm=score,
                confidence=confidence,
            )
            if best_for_family is None or match.score_mm < best_for_family.score_mm:
                best_for_family = match
        if best_for_family is not None:
            matches.append(best_for_family)
    matches.sort(key=lambda m: m.score_mm)
    return matches


def match_known_family_from_bbox(
    bbox_mm: tuple[float, float, float],
    registry: TemplateRegistry | None = None,
) -> ReverseImportMatch | None:
    """The single closest candidate (see :func:`match_known_families_from_bbox`)."""

    matches = match_known_families_from_bbox(bbox_mm, registry)
    return matches[0] if matches else None


def geometry_signature_matches(
    imported_report: object,
    rebuilt_report: object,
    *,
    volume_tolerance: float = 0.08,
    surface_tolerance: float = 0.18,
) -> GeometrySignatureCheck:
    """Verify that a bbox match also agrees on mesh-scale geometry.

    Bounding boxes are necessary but not sufficient for reverse import: a solid block, hollow box,
    and tray can share the same envelope. Volume and surface area are the cheapest stable signals
    both the uploaded mesh and rebuilt trusted twin already expose.
    """

    imported_volume = _positive_number(getattr(imported_report, "volume_mm3", None))
    rebuilt_volume = _positive_number(getattr(rebuilt_report, "volume_mm3", None))
    imported_surface = _positive_number(getattr(imported_report, "surface_area_mm2", None))
    rebuilt_surface = _positive_number(getattr(rebuilt_report, "surface_area_mm2", None))

    reasons: list[str] = []
    volume_delta = _relative_delta(imported_volume, rebuilt_volume)
    surface_delta = _relative_delta(imported_surface, rebuilt_surface)

    if volume_delta is None:
        reasons.append("volume unavailable")
    elif volume_delta > volume_tolerance:
        reasons.append(f"volume differs by {volume_delta:.1%}")

    if surface_delta is None:
        reasons.append("surface area unavailable")
    elif surface_delta > surface_tolerance:
        reasons.append(f"surface area differs by {surface_delta:.1%}")

    return GeometrySignatureCheck(
        ok=not reasons,
        volume_delta=volume_delta,
        surface_delta=surface_delta,
        reasons=tuple(reasons),
    )


def plan_from_match(match: ReverseImportMatch, source_filename: str) -> DesignPlan:
    """Create a design plan for a matched reverse import."""

    family = match.family
    label = family.object_types[0] if family.object_types else family.name.replace("_", " ")
    return DesignPlan(
        object_type=label,
        summary=f"Reverse-imported {label} from {source_filename}.",
        dimensions=dict(match.values),
        bounding_box_mm=[float(v) for v in match.expected_bbox_mm],
        assumptions=[
            "Imported mesh matched a known part family by measured bounding box plus volume/surface checks.",
            "Feature semantics come from the trusted template twin, not from raw triangle inference.",
        ],
        open_questions=[],
    )


def _candidate_values(
    family: TemplateFamily,
    bbox_mm: tuple[float, float, float],
) -> list[dict[str, float]]:
    defaults = clamp_values(family, {})
    direct = dict(defaults)
    for param in family.params:
        if param.bbox_axis is None:
            continue
        axis_terms = (family.bbox_x, family.bbox_y, family.bbox_z)[param.bbox_axis]
        if _axis_is_direct_param(axis_terms, param.name):
            direct[param.name] = bbox_mm[param.bbox_axis]
    direct = clamp_values(family, direct)
    if direct == defaults:
        return [defaults]
    return [direct, defaults]


def _axis_is_direct_param(terms: tuple[object, ...], name: str) -> bool:
    return (
        len(terms) == 1
        and getattr(terms[0], "ref", "") == name
        and abs(float(getattr(terms[0], "coef", 0.0)) - 1.0) <= 1e-9
    )


def _bbox_score(
    measured: tuple[float, float, float],
    expected: tuple[float, float, float],
) -> float:
    return sum(abs(m - e) for m, e in zip(measured, expected)) / 3.0


def _match_tolerance(
    measured: tuple[float, float, float],
    expected: tuple[float, float, float],
) -> float:
    scale = max(max(measured), max(expected), 1.0)
    return max(0.75, scale * 0.02)


def _positive_number(value: object) -> float | None:
    if not isinstance(value, (int, float)):
        return None
    value = float(value)
    if not math.isfinite(value) or value <= 0:
        return None
    return value


def _relative_delta(a: float | None, b: float | None) -> float | None:
    if a is None or b is None:
        return None
    return abs(a - b) / max(a, b, 1e-9)
