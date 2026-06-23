import io
import json

from kimcad.visual_loop import (
    decode_image_payloads,
    decode_image_views,
    default_probes,
    normalize_models,
    normalize_probes,
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
    assert normalize_models(None) == ["qwen2.5vl:7b"]
    assert normalize_models(None, fallback=("qwen2.5vl:7b", "minicpm-v:8b")) == [
        "qwen2.5vl:7b",
        "minicpm-v:8b",
    ]
    assert normalize_models([" qwen3-vl:8b ", "qwen3-vl:8b", "", 42]) == ["qwen3-vl:8b"]


def test_normalize_models_rejects_unconfigured_models_and_caps_count():
    assert normalize_models(["unknown:70b", "qwen2.5vl:7b"]) == ["qwen2.5vl:7b"]
    assert normalize_models([
        "qwen3-vl:8b",
        "qwen2.5vl:7b",
        "minicpm-v:8b",
        "qwen3-vl:8b",
        "unknown:70b",
    ]) == ["qwen3-vl:8b", "qwen2.5vl:7b", "minicpm-v:8b"]


def test_normalize_probes_accepts_vcl_bench_probe_shapes():
    probes = normalize_probes(
        {"f01_wrong_face_hole": "Look at the TOP face. Is there a hole?"},
        intent="a block with a top hole",
    )
    assert probes[0].id == "f01_wrong_face_hole"
    assert "TOP face" in probes[0].question
    explicit = normalize_probes(
        [{"id": "custom probe", "question": "Is the tab visible?"}],
        intent="a plate with a tab",
    )
    assert explicit[0].id == "custom_probe"


def test_review_design_images_runs_batched_atomic_probes_and_keeps_geometry_facts():
    calls = []

    class _Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        body = json.loads(req.data)
        prompt = body["messages"][1]["content"]
        calls.append(body)
        answers = []
        for probe_id in ("visible_object", "gross_intent", "top_face_feature", "mounting_holes_visible"):
            if probe_id in prompt:
                answers.append({
                    "id": probe_id,
                    "answer": "no" if probe_id == "top_face_feature" else "yes",
                    "pass": False if probe_id == "top_face_feature" else True,
                    "evidence": "The hole appears on the side." if probe_id == "top_face_feature" else "The part is visible.",
                })
        return _Resp(json.dumps({"message": {"content": json.dumps({"probes": answers})}}).encode())

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
    assert len(calls) == 1
    assert calls[0]["options"]["temperature"] == 0
    assert calls[0]["options"]["num_predict"] == 1024
    assert "Probe questions" in calls[0]["messages"][1]["content"]
    assert "Rendered view labels" in calls[0]["messages"][1]["content"]


def test_review_design_images_with_models_requires_agreement_for_issues():
    class _Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        body = json.loads(req.data)
        answers = [
            {"id": "visible_object", "answer": "yes", "pass": True, "evidence": "The part is visible."},
            {"id": "gross_intent", "answer": "yes", "pass": True, "evidence": "The part is visible."},
            {"id": "top_face_feature", "answer": "no", "pass": False, "evidence": f"{body['model']} sees a side hole."},
            {"id": "mounting_holes_visible", "answer": "yes", "pass": True, "evidence": "A hole is visible."},
        ]
        return _Resp(json.dumps({"message": {"content": json.dumps({"probes": answers})}}).encode())

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
        fail = body["model"] == "qwen2.5vl:7b"
        answers = [
            {"id": "visible_object", "answer": "yes", "pass": True, "evidence": "Looks visible."},
            {"id": "gross_intent", "answer": "yes", "pass": True, "evidence": "Looks correct."},
            {
                "id": "top_face_feature",
                "answer": "no" if fail else "yes",
                "pass": False if fail else True,
                "evidence": "The feature may be on the side." if fail else "Looks correct.",
            },
            {"id": "mounting_holes_visible", "answer": "yes", "pass": True, "evidence": "A hole is visible."},
        ]
        return _Resp(json.dumps({"message": {"content": json.dumps({"probes": answers})}}).encode())

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
        answers = [
            {"id": "visible_object", "answer": "yes", "pass": True, "evidence": "The part is visible."},
            {"id": "gross_intent", "answer": "yes", "pass": True, "evidence": "The part is visible."},
        ]
        return _Resp(json.dumps({"message": {"content": json.dumps({"probes": answers})}}).encode())

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


def test_empty_or_unparseable_vcl_answer_needs_human_review():
    class _Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _empty(req, timeout=None):
        return _Resp(json.dumps({"message": {"content": ""}}).encode())

    review = review_design_images(intent="a cube", images_b64=["YQ=="], opener=_empty)
    assert review.status == "needs_review"
    assert review.probes[0].pass_ is None

    def _garbage(req, timeout=None):
        return _Resp(json.dumps({"message": {"content": "yes looks good"}}).encode())

    review = review_design_images(intent="a cube", images_b64=["YQ=="], opener=_garbage)
    assert review.status == "needs_review"
    assert all(probe.pass_ is None for probe in review.probes)
