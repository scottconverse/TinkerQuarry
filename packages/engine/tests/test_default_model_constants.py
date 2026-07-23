"""ENGINEERING-3 (v1.5.0 gate): the fallback model constants must not drift from what ships.

``config.py`` carries DEFAULT_CHAT_MODEL / DEFAULT_VISION_MODEL as the last-resort names used
when backend resolution itself fails (``webapp.py``'s ``... or DEFAULT_VISION_MODEL`` in the
model-status and model-pull handlers). They were hand-maintained literals, and
DEFAULT_VISION_MODEL had gone stale: it said ``qwen2.5vl:7b`` while ``config/default.yaml``
ships ``qwen2.5vl:3b`` -- the model actually benchmarked for this product
(``llm_provider.py``'s own docstring: "qwen2.5vl:3b read dimensioned sketches 3/3 on-target").

Low-probability, but the consequence is specific: in the branch that reaches it, the setup
wizard would tell a user to download a ~7B vision model nobody ever measured here instead of the
validated 3B one. Same root cause as ENGINEERING-2 -- a model-default change that didn't
propagate to every hardcoded copy. The constants are now DERIVED from the shipped config (the
way ``shipped_cloud_hosts()`` derives its allow-list), and this pins that they agree.
"""

from __future__ import annotations

import yaml

from kimcad.config import DEFAULT_CHAT_MODEL, DEFAULT_CONFIG, DEFAULT_VISION_MODEL


def _shipped_active_backend() -> dict:
    """The SHIPPED active backend, read from config/default.yaml directly -- never the merged
    config, because config/local.yaml is machine-local and must not influence a shipped default."""
    data = yaml.safe_load(DEFAULT_CONFIG.read_text(encoding="utf-8")) or {}
    llm = data.get("llm") or {}
    return (llm.get("backends") or {})[llm["active"]]


def test_default_vision_model_matches_the_shipped_config():
    assert DEFAULT_VISION_MODEL == _shipped_active_backend()["vision_model"]


def test_default_chat_model_matches_the_shipped_config():
    assert DEFAULT_CHAT_MODEL == _shipped_active_backend()["model_name"]


def test_the_constants_are_non_empty_strings():
    """Deriving from a file introduces a new failure mode -- an unreadable/renamed config must
    not silently yield '' and have the wizard advise downloading a model called nothing."""
    for value in (DEFAULT_CHAT_MODEL, DEFAULT_VISION_MODEL):
        assert isinstance(value, str) and value.strip()
        assert ":" in value  # an ollama-style name:tag


def test_the_llmbackend_dataclass_default_tracks_the_constant():
    """LLMBackend.vision_model defaults to the constant at class-definition time, so a drift
    here would silently ship the wrong default to every programmatically built backend."""
    from kimcad.config import LLMBackend

    backend = LLMBackend(
        key="k", provider="ollama", base_url="http://localhost:11434/v1",
        model_name="m", api_key_env=None, temperature=0.2, max_tokens=1,
        supports_structured_output=False,
    )
    assert backend.vision_model == DEFAULT_VISION_MODEL
