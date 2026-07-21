"""QA-3 (v1.5.0 gate): `kimcad design ""` must be rejected before the model is ever called.

The two officially-supported entry points to the same pipeline disagreed on whether an empty
prompt is valid input. webapp.py's ``_handle_design`` rejects an empty/whitespace prompt with a
deterministic 400 BEFORE touching the provider; the CLI had no equivalent check, so it handed
the empty string to a real model. The gate ran ``kimcad design ""`` twice against the local
model: run 1 asked a clarifying question (exit 3), run 2 returned a full "successful" fabricated
design ("Pegboard Hook..."), printability gate PASS, **exit 0** -- a design that reflects no
actual request, reported as success, in a form a script or CI job would treat as a good build.

The guard has to fire BEFORE dispatch, so these tests assert on both the exit code and on the
provider never having been called.
"""

from __future__ import annotations

import pytest

import kimcad.cli as cli
from kimcad.cli import main

from conftest import BAMBU, PLA, FakeProvider
from conftest import box_renderer, make_plan


class _ExplodingProvider(FakeProvider):
    """Any call at all is the failure: an empty prompt must never reach the model."""

    def generate_design_plan(self, prompt, printer, material, history=None):  # noqa: ANN001
        raise AssertionError(f"the model was called with an empty prompt: {prompt!r}")


def _patch_pipeline(monkeypatch, provider):
    from kimcad.config import Config
    from kimcad.pipeline import Pipeline

    renderer, _state = box_renderer((20, 20, 20))
    monkeypatch.setattr(
        cli,
        "_build_pipeline",
        lambda config, args: Pipeline(Config.load(), BAMBU, PLA, provider, renderer=renderer),
    )


@pytest.mark.parametrize("prompt", ["", "   ", "\t", "\n", " \t\n "])
def test_empty_or_whitespace_prompt_is_rejected_before_the_model_runs(
    monkeypatch, capsys, tmp_path, prompt
):
    _patch_pipeline(monkeypatch, _ExplodingProvider(make_plan([20, 20, 20])))

    with pytest.raises(SystemExit) as exc:
        main(["design", prompt, "--out", str(tmp_path)])

    # argparse's usage-error convention: exit 2, message on stderr. Critically NOT 0 --
    # the observed failure was a fabricated design reported as a clean success.
    assert exc.value.code == 2
    err = capsys.readouterr().err
    assert "describe the part" in err.lower(), err


def test_a_real_prompt_still_runs(monkeypatch, capsys, tmp_path):
    """Guard against a fix that rejects too much."""
    _patch_pipeline(monkeypatch, FakeProvider(make_plan([20, 20, 20])))
    assert main(["design", "a 20mm block", "--out", str(tmp_path)]) == 0
    assert "Gate: PASS" in capsys.readouterr().out


def test_the_cli_and_the_web_layer_agree_on_the_empty_prompt_verdict():
    """The point of QA-3: one pipeline, two front doors, one answer. Pinned structurally so a
    future edit to either guard has to move both."""
    import inspect

    import kimcad.webapp as webapp

    web_src = inspect.getsource(webapp)
    assert "Please describe the part you want." in web_src
    cli_src = inspect.getsource(cli)
    assert "describe the part you want" in cli_src.lower(), (
        "the CLI has no empty-prompt guard mirroring webapp._handle_design"
    )
