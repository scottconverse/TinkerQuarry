"""Local visual correction loop contract.

This module is intentionally advisory. It lets a vision-capable local model inspect rendered
views of a generated part, but it never declares a part print-ready and it never replaces the
deterministic geometry/slice gates. Dimensions, counts, and slice proof stay with the engine.
"""

from __future__ import annotations

import base64
import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit, urlunsplit

VCL_PROBE_ACCEPTANCE = 0.90
VCL_MODEL_HIGH_QUALITY = "qwen3-vl:8b"
VCL_MODEL_RECALL = "qwen2.5vl:7b"
VCL_MODEL_PRECISION = "minicpm-v:8b"
DEFAULT_VCL_MODEL = VCL_MODEL_RECALL
DEFAULT_VCL_MODELS = (VCL_MODEL_HIGH_QUALITY, VCL_MODEL_RECALL, VCL_MODEL_PRECISION)


@dataclass(frozen=True)
class VisualProbe:
    id: str
    question: str


@dataclass(frozen=True)
class VisualProbeResult:
    id: str
    question: str
    answer: str
    pass_: bool | None
    evidence: str = ""

    def to_payload(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "question": self.question,
            "answer": self.answer,
            "pass": self.pass_,
            "evidence": self.evidence,
        }


@dataclass(frozen=True)
class VisualReview:
    status: str  # unavailable | ok | issues | needs_review | error
    mode: str
    advisory: bool = True
    provider: str = "local-ollama"
    model: str = DEFAULT_VCL_MODEL
    models: list[str] = field(default_factory=list)
    summary: str = ""
    findings: list[str] = field(default_factory=list)
    probes: list[VisualProbeResult] = field(default_factory=list)
    model_reviews: list[dict[str, Any]] = field(default_factory=list)
    geometry_facts: dict[str, Any] = field(default_factory=dict)
    correction_prompt: str | None = None

    def to_payload(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "mode": self.mode,
            "advisory": self.advisory,
            "provider": self.provider,
            "model": self.model,
            "models": self.models or [self.model],
            "summary": self.summary,
            "findings": list(self.findings),
            "probes": [p.to_payload() for p in self.probes],
            "model_reviews": self.model_reviews,
            "geometry_facts": self.geometry_facts,
            "correction_prompt": self.correction_prompt,
        }


def native_generate_url(base_url: str) -> str:
    parts = urlsplit(base_url or "")
    if parts.scheme and parts.netloc:
        return urlunsplit((parts.scheme, parts.netloc, "/api/generate", "", ""))
    return (base_url or "http://localhost:11434").rstrip("/").removesuffix("/v1") + "/api/generate"


def decode_image_payloads(values: Any) -> list[str]:
    """Return base64 image payloads from data URLs or raw base64 strings."""
    return [item["image"] for item in decode_image_views(values)]


def decode_image_views(values: Any) -> list[dict[str, str]]:
    """Return labeled base64 image payloads from strings or {label,image} objects."""
    if not isinstance(values, list):
        raise ValueError("images must be a list")
    out: list[dict[str, str]] = []
    for index, value in enumerate(values, start=1):
        label = f"view_{index}"
        raw = ""
        if isinstance(value, dict):
            label_value = value.get("label")
            if isinstance(label_value, str) and label_value.strip():
                label = re.sub(r"[^a-z0-9_-]+", "_", label_value.strip().lower())[:40] or label
            image_value = value.get("image") or value.get("dataUrl") or value.get("data_url")
            raw = image_value.strip() if isinstance(image_value, str) else ""
        elif isinstance(value, str):
            raw = value.strip()
        else:
            continue
        if not raw:
            continue
        if raw.startswith("data:image/"):
            _, _, raw = raw.partition(",")
        base64.b64decode(raw, validate=True)
        out.append({"label": label, "image": raw})
    if not out:
        raise ValueError("at least one rendered image is required")
    return out


def default_probes(intent: str) -> list[VisualProbe]:
    """Build conservative yes/no probes from the text intent."""
    prompt = intent.strip()
    probes = [
        VisualProbe(
            "visible_object",
            "Is there a clear 3D part visible in the rendered images? Answer yes or no.",
        ),
        VisualProbe(
            "gross_intent",
            f"Does the visible part broadly match this requested object: {prompt!r}? Answer yes or no.",
        ),
    ]
    face_match = re.search(r"\b(top|bottom|front|back|left|right)\s+face\b", prompt, re.I)
    if face_match and re.search(r"\b(hole|slot|cutout|mount|mounting)\b", prompt, re.I):
        face = face_match.group(1).lower()
        probes.append(
            VisualProbe(
                f"{face}_face_feature",
                f"Is the requested hole/slot/cutout on the {face} face? Answer yes or no.",
            )
        )
    return probes


def geometry_facts_from_report(report: dict[str, Any] | None) -> dict[str, Any]:
    report = report or {}
    readiness = report.get("readiness") if isinstance(report.get("readiness"), dict) else {}
    return {
        "gate_status": report.get("gate_status"),
        "readiness_score": readiness.get("score") if isinstance(readiness, dict) else None,
        "dims": report.get("dims") or [],
        "watertight": report.get("watertight"),
        "volume_mm3": report.get("volume_mm3"),
    }


def unavailable_review(reason: str, *, model: str = DEFAULT_VCL_MODEL) -> VisualReview:
    return VisualReview(
        status="unavailable",
        mode="local-probe",
        model=model,
        models=[model],
        summary=reason,
        findings=[reason],
    )


def normalize_models(value: Any, *, fallback: tuple[str, ...] = DEFAULT_VCL_MODELS) -> list[str]:
    """Return a de-duplicated model list from API input."""
    raw: list[Any]
    if value is None:
        raw = list(fallback)
    elif isinstance(value, str):
        raw = [value]
    elif isinstance(value, list):
        raw = value
    else:
        raw = []
    models: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        model = item.strip()
        if model and model not in models:
            models.append(model)
    return models or list(fallback)


def review_design_images(
    *,
    intent: str,
    images_b64: list[str],
    report: dict[str, Any] | None = None,
    model: str = DEFAULT_VCL_MODEL,
    view_labels: list[str] | None = None,
    base_url: str = "http://localhost:11434/v1",
    timeout_s: float = 240.0,
    opener: Any = None,
) -> VisualReview:
    """Run local probe-mode visual review over supplied rendered images."""
    return _review_design_images_single(
        intent=intent,
        images_b64=images_b64,
        report=report,
        model=model,
        view_labels=view_labels,
        base_url=base_url,
        timeout_s=timeout_s,
        opener=opener,
    )


def review_design_images_with_models(
    *,
    intent: str,
    images_b64: list[str],
    report: dict[str, Any] | None = None,
    models: list[str] | tuple[str, ...] | None = None,
    view_labels: list[str] | None = None,
    base_url: str = "http://localhost:11434/v1",
    timeout_s: float = 240.0,
    opener: Any = None,
) -> VisualReview:
    """Run advisory probe reviews, using agreement when multiple local critics respond."""
    chosen = normalize_models(list(models) if models is not None else None)
    reviews = [
        _review_design_images_single(
            intent=intent,
            images_b64=images_b64,
            report=report,
            model=model,
            view_labels=view_labels,
            base_url=base_url,
            timeout_s=timeout_s,
            opener=opener,
        )
        for model in chosen
    ]
    usable = [r for r in reviews if r.status in {"ok", "issues"}]
    if not usable:
        first = reviews[0] if reviews else unavailable_review("No local visual review model was selected.")
        return VisualReview(
            status=first.status,
            mode="local-probe-agreement",
            model=chosen[0] if chosen else first.model,
            models=chosen,
            summary=first.summary,
            findings=first.findings,
            probes=first.probes,
            model_reviews=[_model_review_payload(r) for r in reviews],
            geometry_facts=geometry_facts_from_report(report),
            correction_prompt=first.correction_prompt,
        )
    if len(usable) == 1:
        only = usable[0]
        return VisualReview(
            status=only.status,
            mode="local-probe-single",
            model=only.model,
            models=[only.model],
            summary=f"{only.summary} Only one configured local critic responded.",
            findings=only.findings,
            probes=only.probes,
            model_reviews=[_model_review_payload(r) for r in reviews],
            geometry_facts=geometry_facts_from_report(report),
            correction_prompt=only.correction_prompt,
        )

    by_probe: dict[str, list[VisualProbeResult]] = {}
    question_by_probe: dict[str, str] = {}
    for review in usable:
        for probe in review.probes:
            by_probe.setdefault(probe.id, []).append(probe)
            question_by_probe[probe.id] = probe.question

    agreed_findings: list[str] = []
    disagreements: list[str] = []
    combined: list[VisualProbeResult] = []
    quorum = 2
    for probe_id, probe_results in by_probe.items():
        failures = [p for p in probe_results if p.pass_ is False]
        passes = [p for p in probe_results if p.pass_ is True]
        unknowns = [p for p in probe_results if p.pass_ is None]
        if len(failures) >= quorum:
            evidence = "; ".join(p.evidence or p.answer for p in failures if p.evidence or p.answer)
            finding = evidence or f"{probe_id} failed visual review."
            agreed_findings.append(finding)
            combined.append(
                VisualProbeResult(probe_id, question_by_probe[probe_id], "agreed-fail", False, finding)
            )
        elif failures and (passes or unknowns):
            evidence = "; ".join(p.evidence or p.answer for p in failures if p.evidence or p.answer)
            note = evidence or f"{probe_id} was flagged by one local critic."
            disagreements.append(note)
            combined.append(
                VisualProbeResult(probe_id, question_by_probe[probe_id], "disagreement", None, note)
            )
        elif failures:
            evidence = "; ".join(p.evidence or p.answer for p in failures if p.evidence or p.answer)
            disagreements.append(evidence or f"{probe_id} was flagged by one local critic.")
            combined.append(
                VisualProbeResult(probe_id, question_by_probe[probe_id], "single-fail", None, evidence)
            )
        else:
            combined.append(
                VisualProbeResult(
                    probe_id,
                    question_by_probe[probe_id],
                    "agreed-pass" if passes else "unknown",
                    True if passes else None,
                    "",
                )
            )

    if agreed_findings:
        status = "issues"
        summary = "Multiple local visual critics agree on likely visual issues."
    elif disagreements:
        status = "needs_review"
        summary = "Local visual critics disagreed; treat this as a human-review advisory."
    else:
        status = "ok"
        summary = "No obvious visual issues found by local advisory probes."
    correction = None
    if agreed_findings:
        correction = (
            "Revise the generated CAD to address these agreed visual findings without changing "
            f"deterministic geometry facts: {'; '.join(agreed_findings)}"
        )
    return VisualReview(
        status=status,
        mode="local-probe-agreement",
        model=",".join(r.model for r in usable),
        models=[r.model for r in usable],
        summary=summary,
        findings=agreed_findings if agreed_findings else disagreements,
        probes=combined,
        model_reviews=[_model_review_payload(r) for r in reviews],
        geometry_facts=geometry_facts_from_report(report),
        correction_prompt=correction,
    )


def _review_design_images_single(
    *,
    intent: str,
    images_b64: list[str],
    report: dict[str, Any] | None = None,
    model: str = DEFAULT_VCL_MODEL,
    view_labels: list[str] | None = None,
    base_url: str = "http://localhost:11434/v1",
    timeout_s: float = 240.0,
    opener: Any = None,
) -> VisualReview:
    """Run one local probe-mode visual review over supplied rendered images."""
    if not images_b64:
        return unavailable_review("Visual review needs rendered images to inspect.", model=model)
    labels = [label for label in (view_labels or []) if label]
    view_note = (
        f"Rendered view labels, in image order: {', '.join(labels)}.\n"
        if labels else
        "Rendered view labels are unavailable; inspect the supplied images as current preview views.\n"
    )
    probes = default_probes(intent)
    answers: list[VisualProbeResult] = []
    findings: list[str] = []
    urlopen = opener or urllib.request.urlopen
    for probe in probes:
        payload = {
            "model": model,
            "stream": False,
            "images": images_b64,
            "prompt": (
                "You are an advisory visual critic for a 3D printable part. "
                "Answer only JSON with keys answer, pass, evidence. "
                "The pass key must be true, false, or null. "
                "Do not estimate dimensions or exact counts.\n"
                f"User intent: {intent}\n"
                f"{view_note}"
                f"Question: {probe.question}"
            ),
        }
        req = urllib.request.Request(
            native_generate_url(base_url),
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        try:
            response = json.loads(urlopen(req, timeout=timeout_s).read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return unavailable_review(
                    "The local visual review model is not downloaded yet.", model=model
                )
            return VisualReview(
                status="error",
                mode="local-probe",
                model=model,
                summary="The local visual review model errored.",
                findings=["The local visual review model errored."],
                geometry_facts=geometry_facts_from_report(report),
            )
        except Exception:
            return unavailable_review(
                "Could not reach the local visual review model.", model=model
            )
        answers.append(_parse_probe_response(probe, str(response.get("response") or "")))

    for item in answers:
        if item.pass_ is False:
            findings.append(item.evidence or f"{item.id} failed visual review.")
    status = "issues" if findings else "ok"
    correction = None
    if findings:
        correction = (
            "Revise the generated CAD to address these visual findings without changing "
            f"deterministic geometry facts: {'; '.join(findings)}"
        )
    return VisualReview(
        status=status,
        mode="local-probe",
        model=model,
        models=[model],
        summary=(
            "No obvious visual issues found by local advisory probes."
            if status == "ok"
            else "Local advisory probes found likely visual issues."
        ),
        findings=findings,
        probes=answers,
        geometry_facts=geometry_facts_from_report(report),
        correction_prompt=correction,
    )


def _model_review_payload(review: VisualReview) -> dict[str, Any]:
    return {
        "status": review.status,
        "model": review.model,
        "summary": review.summary,
        "findings": list(review.findings),
        "probes": [p.to_payload() for p in review.probes],
    }


def _parse_probe_response(probe: VisualProbe, text: str) -> VisualProbeResult:
    cleaned = text.strip()
    try:
        if "```" in cleaned:
            cleaned = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", cleaned, flags=re.M).strip()
        obj = json.loads(cleaned)
        answer = str(obj.get("answer") or "").strip()
        passed = obj.get("pass")
        if passed not in (True, False, None):
            passed = None
        evidence = str(obj.get("evidence") or "").strip()
    except Exception:
        low = cleaned.lower()
        if re.search(r"\b(no|false|does not|missing|wrong)\b", low):
            passed = False
        elif re.search(r"\b(yes|true|matches)\b", low):
            passed = True
        else:
            passed = None
        answer = cleaned[:200]
        evidence = cleaned[:500]
    return VisualProbeResult(probe.id, probe.question, answer, passed, evidence)
