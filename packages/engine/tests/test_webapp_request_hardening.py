"""QA-1 / QA-2 (v1.5.0 gate): the HTTP layer must always ANSWER.

QA-1 -- a wrong-TYPE JSON field (``{"outcome": {...}}`` instead of ``{"outcome": "success"}``)
raised ``TypeError: unhashable type: 'dict'`` on the request thread. ThreadingHTTPServer isolates
the crash, so the server survives -- but that one client gets ZERO bytes back. "Empty reply from
server" is strictly worse than a 500: it is indistinguishable from the process being down, so a
client retries or reports an outage instead of fixing its request. webapp.py states the invariant
"never leak a traceback to the browser"; a dropped connection breaks it in the other direction.

The gate live-reproduced this on three handlers, and explicitly recorded that "roughly 6-9 POST
handlers" were never individually audited. So this module does not test three spots -- it sweeps
EVERY POST route and EVERY JSON field each route reads, with a dict and a list in each slot, and
asserts an HTTP response comes back every time.

QA-2 -- a ``Transfer-Encoding: chunked`` body is silently discarded (stdlib
BaseHTTPRequestHandler never decodes chunked framing, and ``_read_json_body`` treats an absent
Content-Length as 0), so the caller is told the field was empty when real bytes were dropped.
"""

from __future__ import annotations

import http.client
import json
import threading
import time
from contextlib import contextmanager
from http.server import ThreadingHTTPServer

import pytest

from kimcad.config import Config
from kimcad.pipeline import Pipeline
from kimcad.webapp import make_handler

from conftest import BAMBU, PLA, FakeProvider
from conftest import box_renderer as _shared_box_renderer
from conftest import make_plan as _plan


@contextmanager
def _serve(root):
    render, _state = _shared_box_renderer((20, 20, 20))
    pipe = Pipeline(Config.load(), BAMBU, PLA, FakeProvider(_plan([20, 20, 20])), renderer=render)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(pipe, root))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        yield "127.0.0.1", httpd.server_address[1]
    finally:
        httpd.shutdown()
        httpd.server_close()


class DroppedConnection(AssertionError):
    """The server closed without writing a single byte -- the QA-1 failure mode."""


def _post_once(host, port, path, payload, *, headers=None):
    body = json.dumps(payload).encode()
    conn = http.client.HTTPConnection(host, port, timeout=15)
    try:
        hdrs = {"Content-Type": "application/json"}
        hdrs.update(headers or {})
        conn.request("POST", path, body=body, headers=hdrs)
        resp = conn.getresponse()
        return resp.status, resp.read()
    finally:
        conn.close()


def _post(host, port, path, payload, *, headers=None, attempts=3):
    """POST JSON and return (status, body). Raises DroppedConnection when the server
    answered with nothing at all, which is precisely the defect under test.

    Retried: the defect is deterministic (the same TypeError on every request), so it drops
    every attempt, while Windows' ephemeral-port/TIME_WAIT churn under this module's ~140
    short-lived connections can produce a one-off connect failure that is NOT the defect.
    Only an all-attempts drop is reported."""
    last: Exception | None = None
    for i in range(attempts):
        try:
            return _post_once(host, port, path, payload, headers=headers)
        except (http.client.BadStatusLine, http.client.RemoteDisconnected, OSError) as e:
            last = e
            if i + 1 < attempts:
                time.sleep(0.2)
    raise DroppedConnection(
        f"POST {path} {payload!r} -> no HTTP response in {attempts} attempts "
        f"({type(last).__name__}: {last})"
    ) from last


def _make_design(host, port) -> int:
    status, raw = _post(host, port, "/api/design", {"prompt": "a 20 mm block"})
    assert status == 200, raw
    d = json.loads(raw)
    assert d["status"] == "completed", d
    return int(d["mesh_url"].rsplit("/", 1)[-1])


# Every POST route the server dispatches, paired with every JSON field its handler reads.
# Derived by walking do_POST's dispatch table and grepping each handler for data.get("...").
# `{rid}` is substituted with a real registered design id so the handler actually reaches its
# body parsing rather than short-circuiting on a 404.
ROUTE_FIELDS: list[tuple[str, tuple[str, ...]]] = [
    ("/api/design", ("prompt", "history", "job_id", "experimental")),
    ("/api/settings", (
        "default_printer", "default_material", "cloud_enabled", "cloud_model",
        "openrouter_api_key", "experimental_enabled", "reset",
    )),
    ("/api/libraries/admit", ("name", "path")),
    ("/api/libraries/remove", ("name", "slug")),
    ("/api/connections", ("name",)),
    ("/api/visual-review/{rid}", ("images", "models", "model", "agreement", "probes")),
    ("/api/slice/{rid}", ("printer", "material")),
    ("/api/render/{rid}", ("values",)),
    ("/api/orient/{rid}", ("axis", "degrees")),
    ("/api/send/{rid}", ("connector",)),
    ("/api/print-outcome/{rid}", ("outcome",)),
    ("/api/designs/save", ("design_id", "saved_id", "name", "thumbnail")),
    ("/api/designs/whatever/rename", ("name",)),
]

WRONG_TYPES = [
    ("dict", {"nested": "value"}),
    ("list", ["a", "b"]),
    ("int", 12345),
    ("bool", True),
]

_CASES = [
    pytest.param(route, field, label, value, id=f"{route}-{field}-{label}")
    for route, fields in ROUTE_FIELDS
    for field in fields
    for label, value in WRONG_TYPES
]


@pytest.fixture(scope="module")
def server(tmp_path_factory):
    root = tmp_path_factory.mktemp("hardening")
    with _serve(root) as (host, port):
        rid = _make_design(host, port)
        yield host, port, rid


@pytest.mark.parametrize("route,field,label,value", _CASES)
def test_wrong_type_field_always_gets_an_http_response(server, route, field, label, value):
    """QA-1: no JSON field of any type may kill the request thread with zero bytes returned.

    The bar here is the documented contract, not a specific status: SOMETHING well-formed must
    come back. A typed 400 is the good answer; the shared do_POST safety net's typed 500 is the
    acceptable floor. A dropped connection is the defect."""
    host, port, rid = server
    status, raw = _post(host, port, route.format(rid=rid), {field: value})

    assert 200 <= status < 600, f"nonsense status {status}"
    # Whatever the outcome, the response body is the JSON envelope the API promises.
    parsed = json.loads(raw or b"{}")
    assert isinstance(parsed, dict), f"non-object body for {route} {field}={label}: {raw!r}"
    if status >= 400:
        assert parsed.get("error"), f"{status} with no error message: {raw!r}"


def test_wrong_type_settings_fields_are_a_clean_400(server):
    """The three live-reproduced sites should not merely survive via the safety net -- they get
    the isinstance-first 400 that the already-correct handlers (_handle_send, _handle_render)
    have always given. Pinned so a regression back to a 500 is visible."""
    host, port, rid = server
    for payload in (
        {"default_printer": {"a": 1}},
        {"default_printer": ["a"]},
        {"default_material": {"a": 1}},
        {"default_material": ["a"]},
    ):
        status, raw = _post(host, port, "/api/settings", payload)
        assert status == 400, (payload, status, raw)
        assert json.loads(raw).get("error")


def test_wrong_type_slice_and_outcome_fields_are_a_clean_400(server):
    host, port, rid = server
    for path, payload in (
        (f"/api/slice/{rid}", {"printer": {"a": 1}}),
        (f"/api/slice/{rid}", {"printer": ["a"]}),
        (f"/api/slice/{rid}", {"material": {"a": 1}}),
        (f"/api/print-outcome/{rid}", {"outcome": {"a": 1}}),
        (f"/api/print-outcome/{rid}", {"outcome": ["a"]}),
    ):
        status, raw = _post(host, port, path, payload)
        assert status == 400, (path, payload, status, raw)
        assert json.loads(raw).get("error")


def test_correct_types_still_work(server):
    """Guard against a fix that hardens by rejecting everything: the happy paths still pass."""
    host, port, rid = server
    status, raw = _post(host, port, "/api/settings", {"default_printer": "bambu_p2s"})
    assert status == 200, raw
    assert json.loads(raw).get("saved") is True
    status, raw = _post(host, port, f"/api/print-outcome/{rid}", {"outcome": "skip"})
    assert status == 200, raw
    assert json.loads(raw).get("outcome") == "skip"


# The rest of do_POST's dispatch table. These handlers read a RAW binary body
# (photo/sketch/reverse-import/design-import) or no body at all (model-pull, delete,
# duplicate), so they have no JSON field to wrong-type -- but the gate's note that "roughly
# 6-9 POST handlers were never individually audited" is only discharged by touching every one.
# A JSON object is the wrong shape for all of them; each must still ANSWER.
OTHER_POST_ROUTES = [
    "/api/model-pull",
    "/api/photo-seed",
    "/api/sketch-seed",
    "/api/reverse-import",
    "/api/designs/import",
    "/api/designs/nope/delete",
    "/api/designs/nope/duplicate",
    "/api/libraries/admit",
    "/api/libraries/remove",
    "/api/connections",
    "/api/nonexistent-route",
]


@pytest.mark.parametrize("route", OTHER_POST_ROUTES)
@pytest.mark.parametrize(
    "payload", [{}, {"unexpected": {"a": 1}}, {"unexpected": [1, 2]}], ids=["empty", "dict", "list"]
)
def test_every_remaining_post_route_answers(server, route, payload):
    host, port, _rid = server
    status, raw = _post(host, port, route, payload)
    assert 200 <= status < 600
    assert isinstance(json.loads(raw or b"{}"), dict)


def test_the_shared_safety_net_catches_a_handler_that_was_never_guarded():
    """QA-1 root fix, pinned independently of the three per-field guards.

    The point of the shared try/except is FUTURE fields nobody has audited yet. So this test
    doesn't rely on any known-bad input: it injects a handler that raises the same class of
    error and asserts the client gets the documented typed 500 with a JSON envelope, not a
    dropped connection. Delete the try/except in do_POST and this test goes red while every
    field-specific test above stays green -- which is exactly the coverage the gate was missing.
    """
    import tempfile
    from pathlib import Path

    render, _state = _shared_box_renderer((20, 20, 20))
    pipe = Pipeline(Config.load(), BAMBU, PLA, FakeProvider(_plan([20, 20, 20])), renderer=render)
    with tempfile.TemporaryDirectory() as td:
        base = make_handler(pipe, Path(td))

        class Exploding(base):
            def _handle_connections_post(self):
                {"unhashable": "key"} in {"a", "b"}  # noqa: B015 - the real TypeError shape

        httpd = ThreadingHTTPServer(("127.0.0.1", 0), Exploding)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            status, raw = _post("127.0.0.1", httpd.server_address[1], "/api/connections", {})
        finally:
            httpd.shutdown()
            httpd.server_close()

    assert status == 500, raw
    body = json.loads(raw)
    assert body.get("error")
    assert "Traceback" not in body["error"], "the traceback must stay in the terminal"


def test_the_safety_net_does_not_latch_across_a_kept_alive_connection():
    """The 'has a response gone out' flag is per-REQUEST; the handler instance is per-CONNECTION.

    Found while reviewing the QA-1 fix itself: without a per-request reset the flag latches after
    the first response, and every later request on that same connection that hits an unguarded
    field gets the dropped connection back -- the safety net silently stops working exactly where
    it is needed. The product currently negotiates HTTP/1.0 (one request per connection), so this
    is latent rather than live; it is pinned here because it is one `protocol_version` edit away,
    and a latent hole in a safety net is indistinguishable from no safety net later on.
    """
    import tempfile
    from pathlib import Path

    render, _state = _shared_box_renderer((20, 20, 20))
    pipe = Pipeline(Config.load(), BAMBU, PLA, FakeProvider(_plan([20, 20, 20])), renderer=render)
    with tempfile.TemporaryDirectory() as td:
        base = make_handler(pipe, Path(td))

        class KeepAlive(base):
            protocol_version = "HTTP/1.1"  # one instance serves many requests

            def _handle_connections_post(self):
                {"unhashable": "key"} in {"a", "b"}  # noqa: B015

        httpd = ThreadingHTTPServer(("127.0.0.1", 0), KeepAlive)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            conn = http.client.HTTPConnection("127.0.0.1", httpd.server_address[1], timeout=10)
            try:
                # request 1 on the connection: a normal 200, which sets the flag
                conn.request(
                    "POST", "/api/settings",
                    body=json.dumps({"default_printer": "bambu_p2s"}).encode(),
                    headers={"Content-Type": "application/json"},
                )
                assert conn.getresponse().read() is not None

                # request 2 on the SAME connection: the crash must still be answered
                conn.request(
                    "POST", "/api/connections", body=b"{}",
                    headers={"Content-Type": "application/json"},
                )
                resp = conn.getresponse()
                status, raw = resp.status, resp.read()
            finally:
                conn.close()
        finally:
            httpd.shutdown()
            httpd.server_close()

    assert status == 500, raw
    assert json.loads(raw).get("error")


# --- QA-2: chunked request bodies ------------------------------------------------------


def _post_chunked(host, port, path, body: bytes):
    """POST with Transfer-Encoding: chunked and NO Content-Length -- real chunk framing."""
    conn = http.client.HTTPConnection(host, port, timeout=15)
    try:
        conn.putrequest("POST", path, skip_accept_encoding=True)
        conn.putheader("Content-Type", "application/json")
        conn.putheader("Transfer-Encoding", "chunked")
        conn.endheaders()
        conn.send(b"%x\r\n" % len(body) + body + b"\r\n0\r\n\r\n")
        resp = conn.getresponse()
        return resp.status, resp.read()
    finally:
        conn.close()


def test_chunked_body_is_named_not_silently_treated_as_empty(server):
    """QA-2: 42 real bytes arrived; the stdlib handler never decodes chunked framing and
    _read_json_body treated the absent Content-Length as 0, so the client was told the PROMPT
    was empty. Tell the truth instead: chunked isn't supported (411 Length Required)."""
    host, port, _rid = server
    body = json.dumps({"prompt": "a cube with a hole"}).encode()

    status, raw = _post_chunked(host, port, "/api/design", body)

    msg = json.loads(raw or b"{}").get("error", "")
    assert status == 411, f"expected 411 Length Required, got {status}: {raw!r}"
    assert "chunk" in msg.lower(), f"the error must NAME chunked encoding, got {msg!r}"
    assert "describe the part" not in msg.lower(), (
        "the old misleading 'your prompt was empty' diagnostic is still being returned"
    )


def test_chunked_body_on_the_raw_body_route_is_also_named(server):
    """The sibling _read_raw_body path (design import / reverse import) shares the flaw."""
    host, port, _rid = server
    status, raw = _post_chunked(host, port, "/api/designs/import", b'{"design": {}}')

    msg = json.loads(raw or b"{}").get("error", "")
    assert status == 411, f"expected 411 Length Required, got {status}: {raw!r}"
    assert "chunk" in msg.lower(), f"the error must NAME chunked encoding, got {msg!r}"


def test_a_normal_content_length_body_is_unaffected(server):
    """The shipped SPA always sends Content-Length; the 411 must not touch it."""
    host, port, _rid = server
    status, raw = _post(host, port, "/api/design", {"prompt": ""})
    assert status == 400
    assert "describe the part" in json.loads(raw)["error"].lower()
