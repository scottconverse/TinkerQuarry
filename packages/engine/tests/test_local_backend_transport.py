"""ENGINEERING-1 regression: the DECLARED provider — not loopback-ness — picks the transport.

A local model server is not necessarily Ollama. LM Studio (config/default.yaml's own comment
says "LM Studio uses :1234"; README.md says it "also works if you prefer to run your own") and
llama.cpp's ``llama-server`` both listen on loopback and serve ONLY the OpenAI-compatible
``POST {base_url}/chat/completions``. Neither implements Ollama's proprietary ``/api/chat``.

Before the fix, ``_is_ollama_backend()`` returned True for ANY loopback host, so every design
generation against those servers POSTed to ``/api/chat``, got a 404 on every attempt, burned the
full retry budget, and then surfaced "your local AI isn't running" — while the server was up.

These tests stand up a REAL HTTP server that implements only the OpenAI-compatible surface, so
they fail for the real reason (wrong endpoint) rather than against a mock that was told to.
"""

from __future__ import annotations

import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from kimcad.config import LLMBackend, Material, Printer
from kimcad.ir import DesignPlan
from kimcad.llm_provider import LLMProvider, _is_ollama_backend

BAMBU = Printer(
    key="bambu_p2s",
    name="Bambu Lab P2S",
    build_volume=(256, 256, 256),
    nozzle_diameter=0.4,
)
PLA = Material(
    key="pla", name="PLA", nozzle_temp=210, bed_temp=55, wall_multiplier=2.0, shrinkage=0.002
)

PLAN_JSON = {
    "object_type": "cube",
    "summary": "A 40 mm cube with a 5 mm hole.",
    "dimensions": {"size": 40.0, "hole": 5.0},
    "bounding_box_mm": [40.0, 40.0, 40.0],
    "printer": "bambu_p2s",
    "material": "pla",
}


class _OpenAICompatOnlyHandler(BaseHTTPRequestHandler):
    """Implements ONLY ``POST /v1/chat/completions``. Everything else 404s — exactly like
    LM Studio / llama-server, which never expose Ollama's native ``/api/chat``."""

    protocol_version = "HTTP/1.1"

    def log_message(self, *a):  # keep pytest output clean
        pass

    def _send(self, code: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.server.paths.append(("GET", self.path))
        # A live LM Studio answers *something* at the root; 404 is still "the server is alive".
        self._send(404, {"error": "not found"})

    def do_POST(self):
        self.server.paths.append(("POST", self.path))
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        if self.path != "/v1/chat/completions":
            # Ollama's native endpoint does not exist here.
            self._send(404, {"error": f"Unexpected endpoint {self.path}"})
            return
        req = json.loads(raw or b"{}")
        self.server.bodies.append(req)
        content = self.server.reply
        self._send(200, {"choices": [{"message": {"role": "assistant", "content": content}}]})


@contextmanager
def _openai_compatible_server(reply: str):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _OpenAICompatOnlyHandler)
    srv.paths = []
    srv.bodies = []
    srv.reply = reply
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        yield srv
    finally:
        srv.shutdown()
        srv.server_close()
        t.join(timeout=5)


def _lm_studio_backend(port: int) -> LLMBackend:
    """The exact backend shape config/default.yaml:63 + README.md tell a user to create."""
    return LLMBackend(
        key="local",
        provider="openai_compatible",
        base_url=f"http://127.0.0.1:{port}/v1",
        model_name="qwen3.5-9b",
        api_key_env=None,
        temperature=0.2,
        max_tokens=4096,
        supports_structured_output=False,
        timeout_s=15.0,
    )


def test_lm_studio_backend_plans_over_v1_not_ollama_native():
    """Design generation must WORK against an OpenAI-compatible loopback server."""
    with _openai_compatible_server(json.dumps(PLAN_JSON)) as srv:
        provider = LLMProvider(_lm_studio_backend(srv.server_port), max_attempts=2, retry_wait_s=0)

        plan = provider.generate_design_plan("a 40 mm cube with a 5 mm hole", BAMBU, PLA)

        assert isinstance(plan, DesignPlan)
        assert plan.bounding_box_mm == [40.0, 40.0, 40.0]
        assert ("POST", "/v1/chat/completions") in srv.paths
        assert ("POST", "/api/chat") not in srv.paths


def test_lm_studio_backend_codegen_over_v1_not_ollama_native():
    """The codegen half of the pipeline routes the same way (PLAN-004 r2 sent BOTH native)."""
    with _openai_compatible_server("```openscad\ncube(40);\n```") as srv:
        provider = LLMProvider(_lm_studio_backend(srv.server_port), max_attempts=2, retry_wait_s=0)
        plan = DesignPlan.model_validate(PLAN_JSON)

        scad = provider.generate_openscad(plan, BAMBU, PLA)

        assert scad.strip() == "cube(40);"
        assert ("POST", "/v1/chat/completions") in srv.paths
        assert ("POST", "/api/chat") not in srv.paths


@pytest.mark.parametrize(
    # NB: not "base_url" — pytest-base-url ships a session-scoped fixture of that name.
    "key,declared_provider,url,expected",
    [
        # The shipped local backend now DECLARES ollama -> native /api/chat.
        ("local", "ollama", "http://localhost:11434/v1", True),
        # Declared ollama on a non-standard port: the DECLARATION is what counts.
        ("ollama_alt_port", "ollama", "http://127.0.0.1:11999/v1", True),
        # LM Studio: documented supported config, loopback, but NOT Ollama. THE DEFECT.
        ("lmstudio", "openai_compatible", "http://localhost:1234/v1", False),
        # llama.cpp's llama-server: same mechanism, default port 8080, OpenAI-compatible only.
        ("llamacpp", "openai_compatible", "http://127.0.0.1:8080/v1", False),
        # Any other loopback OpenAI-compatible server: loopback-ness alone decides nothing now.
        ("some_local", "openai_compatible", "http://localhost:9000/v1", False),
        # Compatibility: a config written before `provider: ollama` existed, on Ollama's own
        # registered port. config/local.yaml is per-machine and gitignored, so these exist on
        # real installs; routing them to /v1 would silently drop think:false + the `format`
        # schema, the exact combination behind three live release-gate failures.
        ("legacy_local_yaml", "openai_compatible", "http://localhost:11434/v1", True),
        # ...but as a PORT match, not the old "11434 appears anywhere in the string" substring
        # test: a model name or query string carrying those digits must not trigger it.
        ("digits_not_port", "openai_compatible", "http://localhost:1234/v1?ctx=11434", False),
        # A cloud backend stays on the OpenAI-compatible path (unchanged behavior).
        ("cloud", "deepseek", "https://api.deepseek.com/v1", False),
        ("cloud_openrouter", "openai_compatible", "https://openrouter.ai/api/v1", False),
    ],
)
def test_transport_selection_follows_declared_provider(key, declared_provider, url, expected):
    backend = LLMBackend(
        key=key,
        provider=declared_provider,
        base_url=url,
        model_name="m",
        api_key_env=None,
        temperature=0.2,
        max_tokens=4096,
        supports_structured_output=False,
    )
    assert _is_ollama_backend(backend) is expected


def test_shipped_local_backends_declare_ollama():
    """config/default.yaml's Ollama-hosted backends must SAY so, since the provider field is
    now what selects the native transport. A silent regression here would send the shipped
    default back to /v1 and lose the schema-constrained `format` + think:false."""
    import yaml

    from kimcad.config import DEFAULT_CONFIG

    # Read the SHIPPED file, never the merged config — config/local.yaml is machine-local.
    shipped = yaml.safe_load(DEFAULT_CONFIG.read_text(encoding="utf-8")) or {}
    backends = (shipped.get("llm", {}) or {}).get("backends", {}) or {}
    ollama_hosted = {
        key: b for key, b in backends.items() if "11434" in ((b or {}).get("base_url") or "")
    }
    assert ollama_hosted, "expected at least one Ollama-hosted backend in the shipped config"
    for key, b in ollama_hosted.items():
        assert b.get("provider") == "ollama", (
            f"backend {key!r} is hosted on Ollama's port but declares "
            f"provider={b.get('provider')!r}"
        )
