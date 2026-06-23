import io
import json

from kimcad.visual_loop import (
    decode_image_payloads,
    decode_image_views,
    default_probes,
    normalize_models,
    review_design_images,
    review_design_images_with_models,
)


def test_decode_image_payloads_accepts_data_urls():
    assert decode_image_payloads(["data:image/png;base64,YQ=="]) == ["YQ=="]


def test_decode_image_views_accepts_labeled_view_objects():
    assert decode_image_views([
        {"label": "Top Face", "image": "data:image/png;base64,YQ=="},
        {"label": "front", "dataUrl": "Yg=="},
    ]) == [
        {"label": "top_face", "image": "YQ=="},
        {"label": "front", "image": "Yg=="},
    ]


def test_default_probes_adds_face_feature_probe_for_face_hole_intent():
    probes = default_probes("a cube with a mounting hole on the top face")
    assert any(p.id == "top_face_feature" for p in probes)


def test_normalize_models_deduplicates_and_defaults_to_local_agreement_pair():
    assert normalize_models(None) == ["qwen3-vl:8b", "qwen2.5vl:7b", "minicpm-v:8b"]
    assert normalize_models([" qwen3-vl:8b ", "qwen3-vl:8b", "", 42]) == ["qwen3-vl:8b"]


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
    assert any("Rendered view labels" in prompt for prompt in calls)


def test_review_design_images_with_models_requires_agreement_for_issues():
    class _Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        body = json.loads(req.data)
        if "top face" in body["prompt"]:
            answer = {"answer": "no", "pass": False, "evidence": f"{body['model']} sees a side hole."}
        else:
            answer = {"answer": "yes", "pass": True, "evidence": "The part is visible."}
        return _Resp(json.dumps({"response": json.dumps(answer)}).encode())

    review = review_design_images_with_models(
        intent="a cube with a mounting hole on the top face",
        images_b64=["YQ=="],
        models=["qwen2.5vl:7b", "minicpm-v:8b"],
        opener=_fake_urlopen,
    )

    assert review.status == "issues"
    assert review.mode == "local-probe-agreement"
    assert review.models == ["qwen2.5vl:7b", "minicpm-v:8b"]
    assert len(review.model_reviews) == 2
    assert "side hole" in review.findings[0]
    assert review.correction_prompt is not None
    assert "side hole" in review.correction_prompt


def test_review_design_images_with_models_marks_single_model_disagreement_for_review():
    class _Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        body = json.loads(req.data)
        failing_model = body["model"] == "qwen2.5vl:7b" and "top face" in body["prompt"]
        answer = (
            {"answer": "no", "pass": False, "evidence": "The feature may be on the side."}
            if failing_model
            else {"answer": "yes", "pass": True, "evidence": "Looks correct."}
        )
        return _Resp(json.dumps({"response": json.dumps(answer)}).encode())

    review = review_design_images_with_models(
        intent="a cube with a mounting hole on the top face",
        images_b64=["YQ=="],
        models=["qwen2.5vl:7b", "minicpm-v:8b"],
        opener=_fake_urlopen,
    )

    assert review.status == "needs_review"
    assert review.correction_prompt is None
    assert "side" in review.findings[0]


def test_review_design_images_with_models_falls_back_to_one_installed_model():
    class _Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        body = json.loads(req.data)
        if body["model"] == "minicpm-v:8b":
            raise Exception("model missing")
        answer = {"answer": "yes", "pass": True, "evidence": "The part is visible."}
        return _Resp(json.dumps({"response": json.dumps(answer)}).encode())

    review = review_design_images_with_models(
        intent="a cube",
        images_b64=["YQ=="],
        models=["qwen2.5vl:7b", "minicpm-v:8b"],
        opener=_fake_urlopen,
    )

    assert review.status == "ok"
    assert review.mode == "local-probe-single"
    assert review.models == ["qwen2.5vl:7b"]
    assert "Only one configured local critic responded" in review.summary
