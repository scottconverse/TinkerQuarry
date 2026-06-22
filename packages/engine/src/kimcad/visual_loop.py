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

DEFAULT_VCL_MODEL = "qwen2.5vl:7b"


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
    status: str  # unavailable | ok | issues | error
    mode: str
    advisory: bool = True
    provider: str = "local-ollama"
    model: str = DEFAULT_VCL_MODEL
    summary: str = ""
    findings: list[str] = field(default_factory=list)
    probes: list[VisualProbeResult] = field(default_factory=list)
    geometry_facts: dict[str, Any] = field(default_factory=dict)
    correction_prompt: str | None = None

    def to_payload(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "mode": self.mode,
            "advisory": self.advisory,
            "provider": self.provider,
            "model": self.model,
            "summary": self.summary,
            "findings": list(self.findings),
            "probes": [p.to_payload() for p in self.probes],
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
    if not isinstance(values, list):
        raise ValueError("images must be a list")
    out: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        raw = value.strip()
        if not raw:
            continue
        if raw.startswith("data:image/"):
            _, _, raw = raw.partition(",")
        base64.b64decode(raw, validate=True)
        out.append(raw)
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
        summary=reason,
        findings=[reason],
    )


def review_design_images(
    *,
    intent: str,
    images_b64: list[str],
    report: dict[str, Any] | None = None,
    model: str = DEFAULT_VCL_MODEL,
    base_url: str = "http://localhost:11434/v1",
    timeout_s: float = 240.0,
    opener: Any = None,
) -> VisualReview:
    """Run local probe-mode visual review over supplied rendered images."""
    if not images_b64:
        return unavailable_review("Visual review needs rendered images to inspect.", model=model)
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
