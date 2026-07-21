"""WALK-2 (v1.5.0 gate): the model-unavailable message must point at a control that EXISTS.

``MODEL_UNAVAILABLE_MESSAGE`` ended "You can restart it from Settings, then try again." The gate
read the whole of ``AiSettings.tsx`` -- the only AI-related Settings panel -- and found three
cards (Anthropic key, OpenAI key, OpenAI-compatible provider). None is a status display, a health
check, or a restart control for the bundled local backend, which is configured only via
``config/local.yaml`` and never exposed in that UI. A user who follows the instruction to the
letter finds nothing to click.

This string's wording was ALREADY the subject of a prior gate finding (its own code comment cites
"ENG-GG-001 / tester-007 Minor-1" as why it no longer says "Ollama"): the wording was fixed and
the destination it points to was never verified to exist. So this module pins the destination as
well as the vocabulary -- both halves, so the next edit can't fix one and break the other.
"""

from __future__ import annotations

import pytest

from kimcad.pipeline import MODEL_UNAVAILABLE_MESSAGE


def test_it_does_not_send_the_user_to_a_settings_control_that_does_not_exist():
    lowered = MODEL_UNAVAILABLE_MESSAGE.lower()
    assert "from settings" not in lowered, MODEL_UNAVAILABLE_MESSAGE
    assert "in settings" not in lowered, MODEL_UNAVAILABLE_MESSAGE


def test_it_names_the_real_recovery_step():
    """Matching WelcomeScreen.tsx's own native-app copy: the engine starts with the app, so the
    honest steps are wait-and-retry, then reopen TinkerQuarry."""
    lowered = MODEL_UNAVAILABLE_MESSAGE.lower()
    assert "try again" in lowered
    assert "tinkerquarry" in lowered
    assert "reopen" in lowered or "restart" in lowered


@pytest.mark.parametrize("brand", ["ollama", "llama.cpp", "lm studio"])
def test_it_still_never_leaks_a_backend_brand(brand):
    """Regression guard for the PRIOR gate fix (ENG-GG-001 / tester-007 Minor-1): the user knows
    this only as 'KimCad's AI' and has no backend tray icon to consult."""
    assert brand not in MODEL_UNAVAILABLE_MESSAGE.lower()


def test_it_is_plain_text_with_no_markdown():
    """It is rendered as plain text in the chat thread and printed raw on the CLI, so backticks
    or asterisks would show up literally (the exact drift a stage-9 audit caught next door)."""
    for ch in ("`", "*", "_", "[", "]"):
        assert ch not in MODEL_UNAVAILABLE_MESSAGE
