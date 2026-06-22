import io
import json

from kimcad.visual_loop import (
    decode_image_payloads,
    default_probes,
    review_design_images,
)


def test_decode_image_payloads_accepts_data_urls():
    assert decode_image_payloads(["data:image/png;base64,YQ=="]) == ["YQ=="]


def test_default_probes_adds_face_feature_probe_for_face_hole_intent():
    probes = default_probes("a cube with a mounting hole on the top face")
    assert any(p.id == "top_face_feature" for p in probes)


def test_review_design_images_runs_atomic_probes_and_keeps_geometry_facts():
    calls = []

    class _Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        body = json.loads(req.data)
        calls.append(body["prompt"])
        if "top face" in body["prompt"]:
            answer = {"answer": "no", "pass": False, "evidence": "The hole appears on the side."}
        else:
            answer = {"answer": "yes", "pass": True, "evidence": "The part is visible."}
        return _Resp(json.dumps({"response": json.dumps(answer)}).encode())

    review = review_design_images(
        intent="a cube with a mounting hole on the top face",
        images_b64=["YQ=="],
        report={"gate_status": "pass", "readiness": {"score": 92}},
        opener=_fake_urlopen,
    )

    assert review.status == "issues"
    assert review.advisory is True
    assert review.geometry_facts["gate_status"] == "pass"
    assert review.geometry_facts["readiness_score"] == 92
    assert "side" in review.findings[0]
    assert any("Answer only JSON" in prompt for prompt in calls)
