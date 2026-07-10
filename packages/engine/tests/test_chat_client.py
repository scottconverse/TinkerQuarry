"""Behavior of kimcad.chat_client — the thin OpenAI-compatible HTTP client that replaced
the Apache-2.0 `openai` SDK (v1.5-1 license-clean bundle). All tests are hermetic via
httpx.MockTransport; no sockets."""

import json

import httpx
import pytest

from kimcad.chat_client import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    HttpChatClient,
    NotFoundError,
)


def _client(handler, **kw):
    return HttpChatClient(
        "http://localhost:11434/v1",
        "key123",
        timeout_s=30.0,
        transport=httpx.MockTransport(handler),
        **kw,
    )


def test_create_posts_expected_payload_and_parses_content():
    seen = {}

    def handler(request):
        seen["request"] = request
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "hello"}}]}
        )

    resp = _client(handler).chat.completions.create(
        model="m1",
        messages=[{"role": "user", "content": "x"}],
        temperature=0.2,
        max_tokens=64,
    )
    assert resp.choices[0].message.content == "hello"
    req = seen["request"]
    assert str(req.url) == "http://localhost:11434/v1/chat/completions"
    assert req.headers["authorization"] == "Bearer key123"
    body = json.loads(req.content)
    assert body == {
        "model": "m1",
        "messages": [{"role": "user", "content": "x"}],
        "temperature": 0.2,
        "max_tokens": 64,
    }


def test_response_format_is_passed_through_only_when_given():
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": ""}}]})

    c = _client(handler)
    c.chat.completions.create(model="m", messages=[], temperature=0, max_tokens=1)
    assert "response_format" not in seen["body"]
    c.chat.completions.create(
        model="m", messages=[], temperature=0, max_tokens=1,
        response_format={"type": "json_object"},
    )
    assert seen["body"]["response_format"] == {"type": "json_object"}


def test_missing_content_surfaces_as_none():
    # _complete() applies the `or ""` guard; the client stays faithful to the wire shape.
    def handler(request):
        return httpx.Response(200, json={"choices": [{"message": {}}]})

    resp = _client(handler).chat.completions.create(
        model="m", messages=[], temperature=0, max_tokens=1
    )
    assert resp.choices[0].message.content is None


def test_404_raises_notfounderror_with_body_detail():
    def handler(request):
        return httpx.Response(404, json={"error": {"message": "model 'x' not found"}})

    with pytest.raises(NotFoundError) as ei:
        _client(handler).chat.completions.create(
            model="x", messages=[], temperature=0, max_tokens=1
        )
    assert "not found" in str(ei.value)


def test_other_4xx_5xx_raise_apistatuserror_with_status():
    def handler(request):
        return httpx.Response(500, text="boom")

    with pytest.raises(APIStatusError) as ei:
        _client(handler).chat.completions.create(
            model="m", messages=[], temperature=0, max_tokens=1
        )
    assert ei.value.status_code == 500
    assert not isinstance(ei.value, NotFoundError)


def test_connect_error_maps_to_apiconnectionerror():
    def handler(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(APIConnectionError):
        _client(handler).chat.completions.create(
            model="m", messages=[], temperature=0, max_tokens=1
        )


def test_timeout_maps_to_apitimeouterror_and_is_a_connection_error():
    def handler(request):
        raise httpx.ReadTimeout("slow")

    with pytest.raises(APITimeoutError) as ei:
        _client(handler).chat.completions.create(
            model="m", messages=[], temperature=0, max_tokens=1
        )
    # Retry loops catch (APIConnectionError, APITimeoutError); the subclass relation keeps
    # any single-class `except APIConnectionError` correct too, matching the old SDK.
    assert isinstance(ei.value, APIConnectionError)


def test_exception_constructors_match_existing_call_sites():
    # These exact shapes appear across the test suite and cli.py; they must keep working.
    req = httpx.Request("POST", "http://localhost:11434/v1")
    e1 = APIConnectionError(request=req)
    assert "onnection" in str(e1)
    e2 = NotFoundError(
        "model not found", response=httpx.Response(404, request=req), body=None
    )
    assert str(e2) == "model not found"


def test_module_name_supports_cli_provenance_check():
    # cli.py distinguishes our NotFoundError by exception module; pin the contract.
    assert NotFoundError.__module__ == "kimcad.chat_client"
