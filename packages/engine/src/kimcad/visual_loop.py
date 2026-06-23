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
DEFAULT_VCL_MODELS = (DEFAULT_VCL_MODEL,)
AGREEMENT_VCL_MODELS = (VCL_MODEL_RECALL, VCL_MODEL_PRECISION)
AVAILABLE_VCL_MODELS = (VCL_MODEL_HIGH_QUALITY, VCL_MODEL_RECALL, VCL_MODEL_PRECISION, "qwen3-vl:4b")
ALLOWED_VCL_MODELS = frozenset(AVAILABLE_VCL_MODELS)
OLLAMA_VCL_OPTIONS = {"temperature": 0, "num_ctx": 4096, "num_predict": 1024}


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


def native_chat_url(base_url: str) -> str:
    parts = urlsplit(base_url or "")
    if parts.scheme and parts.netloc:
        return urlunsplit((parts.scheme, parts.netloc, "/api/chat", "", ""))
    return (base_url or "http://localhost:11434").rstrip("/").removesuffix("/v1") + "/api/chat"


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


def default_probes(intent: str, report: dict[str, Any] | None = None) -> list[VisualProbe]:
    """Build conservative yes/no probes from text intent and report/plan context.

    These are visual-presence probes only. Counts, dimensions, wall thickness, and exact diameters
    belong to the deterministic geometry gate/oracle and are carried as facts beside the review.
    """
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
    feature_rules = [
        ("round_cylinder", r"\bcylinder|round tube\b", "Is the overall visible shape round/cylindrical rather than box-like? Answer yes or no."),
        ("side_mounting_tabs", r"\btab|ear\b", "Are the requested side mounting tabs or ears visible? Answer yes or no."),
        ("mounting_holes_visible", r"\bmounting holes?|screw holes?\b", "Are mounting or screw holes visible where the part appears to need them? Answer yes or no."),
        ("gridfinity_grid", r"\bgridfinity\b", "Does the part show visible Gridfinity-style grid cells or bin/base features? Answer yes or no."),
        ("threaded_feature", r"\bthread|threaded|screw|bolt\b", "Are helical screw threads visibly present on the requested threaded feature? Answer yes or no."),
        ("hinge_knuckles", r"\bhinge\b", "Does the hinge show cylindrical knuckles/barrel features for a pin? Answer yes or no."),
        ("knob_grip", r"\bknob\b", "Does the knob show grip ridges, knurling, or other graspable texture? Answer yes or no."),
        ("tray_dividers", r"\bdivider|compartment\b", "Are the requested internal dividers or compartments visible? Answer yes or no."),
        ("enclosure_lid", r"\benclosure|lid\b", "If a closed enclosure or lid was requested, is the top visibly covered/closed? Answer yes or no."),
    ]
    seen = {p.id for p in probes}
    for probe_id, pattern, question in feature_rules:
        if probe_id not in seen and re.search(pattern, prompt, re.I):
            probes.append(VisualProbe(probe_id, question))
            seen.add(probe_id)
    if re.search(r"\bplain\b.*\b(no holes?|solid)\b|\bno holes?\b", prompt, re.I):
        probes.append(VisualProbe("no_extra_holes", "Is the part free of unrequested holes or cut-outs? Answer yes or no."))
    return probes


def normalize_probes(value: Any, *, intent: str, report: dict[str, Any] | None = None) -> list[VisualProbe]:
    """Return explicit probe questions when supplied, otherwise derive them from intent/report.

    Accepts the external VCL-Bench shape (`{"fixture_id": "question"}`), or a list of
    `{id, question}` objects. This lets the product use generated/bench probes without changing the
    runtime contract.
    """
    out: list[VisualProbe] = []
    if isinstance(value, dict):
        iterable = [{"id": key, "question": question} for key, question in value.items()]
    elif isinstance(value, list):
        iterable = value
    else:
        iterable = []
    for idx, item in enumerate(iterable, start=1):
        if not isinstance(item, dict):
            continue
        question = item.get("question")
        if not isinstance(question, str) or not question.strip():
            continue
        raw_id = item.get("id")
        probe_id = str(raw_id).strip() if raw_id is not None else f"probe_{idx}"
        probe_id = re.sub(r"[^A-Za-z0-9_.-]+", "_", probe_id).strip("._-") or f"probe_{idx}"
        out.append(VisualProbe(probe_id[:80], question.strip()))
    return out or default_probes(intent, report)


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


def normalize_models(value: Any, *, fallback: tuple[str, ...] | None = DEFAULT_VCL_MODELS) -> list[str]:
    """Return a bounded, configured VCL model list from API input."""
    fallback = fallback or DEFAULT_VCL_MODELS
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
        if model in ALLOWED_VCL_MODELS and model not in models:
            models.append(model)
        if len(models) >= len(AVAILABLE_VCL_MODELS):
            break
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
    probes: list[VisualProbe] | None = None,
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
        probes=probes,
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
    probes: list[VisualProbe] | None = None,
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
            probes=probes,
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
    probes: list[VisualProbe] | None = None,
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
    active_probes = probes or default_probes(intent, report)
    findings: list[str] = []
    urlopen = opener or urllib.request.urlopen
    payload = {
        "model": model,
        "stream": False,
        "options": OLLAMA_VCL_OPTIONS,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an advisory CAD visual inspector. You see rendered views of one "
                    "3D printable part. Answer only strict JSON, with no markdown. Do not estimate "
                    "dimensions, exact counts, wall thickness, or diameters; those are handled by "
                    "the deterministic geometry oracle."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"User intent: {intent}\n"
                    f"{view_note}"
                    f"Deterministic geometry facts: {json.dumps(geometry_facts_from_report(report), sort_keys=True)}\n"
                    "Answer every probe as JSON with this shape: "
                    "{\"probes\":[{\"id\":\"...\",\"answer\":\"yes|no|unknown\",\"pass\":true|false|null,"
                    "\"evidence\":\"one short visual reason\"}]}.\n"
                    "Probe questions:\n"
                    + "\n".join(f"- {p.id}: {p.question}" for p in active_probes)
                ),
                "images": images_b64,
            },
        ],
    }
    req = urllib.request.Request(
        native_chat_url(base_url),
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
    message = response.get("message") if isinstance(response.get("message"), dict) else {}
    text = str(message.get("content") or response.get("response") or "").strip()
    answers = _parse_probe_batch(active_probes, text)

    for item in answers:
        if item.pass_ is False:
            findings.append(item.evidence or f"{item.id} failed visual review.")
    unknowns = [item for item in answers if item.pass_ is None]
    status = "issues" if findings else ("needs_review" if unknowns else "ok")
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
            else (
                "Local advisory probes returned unclear answers; human review is needed."
                if status == "needs_review"
                else "Local advisory probes found likely visual issues."
            )
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


def _parse_probe_batch(probes: list[VisualProbe], text: str) -> list[VisualProbeResult]:
    cleaned = text.strip()
    if not cleaned:
        return [
            VisualProbeResult(p.id, p.question, "", None, "The local visual critic returned no answer.")
            for p in probes
        ]
    try:
        if "```" in cleaned:
            cleaned = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", cleaned, flags=re.M).strip()
        obj = json.loads(cleaned)
    except Exception:
        return [
            VisualProbeResult(p.id, p.question, cleaned[:200], None, "The local visual critic returned unparseable output.")
            for p in probes
        ]
    rows = obj.get("probes") if isinstance(obj, dict) else obj
    if not isinstance(rows, list):
        return [
            VisualProbeResult(p.id, p.question, cleaned[:200], None, "The local visual critic returned JSON in the wrong shape.")
            for p in probes
        ]
    by_id = {p.id: p for p in probes}
    parsed: dict[str, VisualProbeResult] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        probe_id = str(row.get("id") or "").strip()
        probe = by_id.get(probe_id)
        if probe is None:
            continue
        passed = row.get("pass")
        if passed not in (True, False, None):
            passed = None
        parsed[probe_id] = VisualProbeResult(
            probe.id,
            probe.question,
            str(row.get("answer") or "").strip(),
            passed,
            str(row.get("evidence") or "").strip(),
        )
    return [
        parsed.get(p.id)
        or VisualProbeResult(p.id, p.question, "", None, "The local visual critic did not answer this probe.")
        for p in probes
    ]
