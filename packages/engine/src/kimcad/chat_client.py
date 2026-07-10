"""A thin OpenAI-compatible chat client over httpx.

v1.5-1 (license-clean bundle): this module replaces the Apache-2.0 ``openai`` SDK — which
GPL-2.0-only KimCad could not ship in-process — with ~100 lines over the BSD-licensed
``httpx`` we already depend on. It implements exactly the slice of the SDK the engine used:
``client.chat.completions.create(...)`` returning ``.choices[0].message.content``, plus the
three exception types the retry/fallback logic distinguishes. Class names intentionally match
the SDK's so the by-name matcher in pipeline.py and the except-tuples read unchanged; the
provenance check in cli.py pins on ``__module__ == "kimcad.chat_client"``.

No internal retries by construction (ENG-002: KimCad's own loop owns retry policy — the SDK
needed ``max_retries=0`` to be told the same).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx


class APIError(Exception):
    """Base for chat-client errors."""


class APIConnectionError(APIError):
    """The server could not be reached (DNS/refused/reset/TLS)."""

    def __init__(self, message: str = "Connection error.", *, request: Any = None):
        super().__init__(message)
        self.request = request


class APITimeoutError(APIConnectionError):
    """The request timed out (connect or read). Subclass of APIConnectionError so a bare
    ``except APIConnectionError`` keeps catching timeouts, as with the old SDK."""

    def __init__(self, message: str = "Request timed out.", *, request: Any = None):
        super().__init__(message, request=request)


class APIStatusError(APIError):
    """The server answered with an HTTP error status."""

    def __init__(self, message: str, *, response: Any = None, body: Any = None):
        super().__init__(message)
        self.response = response
        self.status_code = getattr(response, "status_code", None)
        self.body = body


class NotFoundError(APIStatusError):
    """HTTP 404 — for KimCad this is 'model not pulled' on a local server."""


def _error_detail(response: httpx.Response) -> str:
    """Best-effort human detail from an error body (OpenAI-style ``error.message`` when
    present, else a short text snippet)."""
    try:
        err = response.json().get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
        if isinstance(err, str) and err:
            return err
    except ValueError:
        pass
    return response.text[:200]


class _Completions:
    def __init__(self, client: "HttpChatClient"):
        self._client = client

    def create(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
        response_format: dict | None = None,
    ) -> Any:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format is not None:
            payload["response_format"] = response_format
        data = self._client._post_chat(payload)
        choices = [
            SimpleNamespace(
                message=SimpleNamespace(content=(c.get("message") or {}).get("content"))
            )
            for c in data.get("choices", [])
        ]
        return SimpleNamespace(choices=choices)


class HttpChatClient:
    """OpenAI-compatible ``POST {base_url}/chat/completions`` client.

    Satisfies llm_provider's ``ChatClient`` protocol (``.chat.completions.create``).
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        timeout_s: float,
        connect_timeout_s: float = 5.0,
        transport: httpx.BaseTransport | None = None,
    ):
        self._url = base_url.rstrip("/") + "/chat/completions"
        # QA-004 (carried over from the SDK client): split connect vs read — a generation may
        # legitimately take minutes, but a live server accepts a TCP connect in seconds.
        self._http = httpx.Client(
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(timeout_s, connect=connect_timeout_s),
            transport=transport,
        )
        self.chat = SimpleNamespace(completions=_Completions(self))

    def _post_chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            response = self._http.post(self._url, json=payload)
        except httpx.TimeoutException as e:
            raise APITimeoutError(f"Request timed out: {e}") from e
        except httpx.TransportError as e:
            raise APIConnectionError(f"Connection error: {e}") from e
        if response.status_code == 404:
            raise NotFoundError(_error_detail(response), response=response)
        if response.status_code >= 400:
            raise APIStatusError(
                f"HTTP {response.status_code}: {_error_detail(response)}",
                response=response,
            )
        try:
            return response.json()
        except ValueError as e:
            # A 200 with a garbled/truncated body (proxy hiccup, server mid-restart) must
            # surface as an APIError-family failure, not a raw JSONDecodeError no caller
            # catches (REVIEW finding, v1.5-1).
            raise APIStatusError(
                f"malformed JSON in a {response.status_code} response: {e}",
                response=response,
            ) from e
