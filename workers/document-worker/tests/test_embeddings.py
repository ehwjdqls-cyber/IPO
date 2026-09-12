"""Real network calls to OpenAI are neither mocked-away pretend-tests nor
possible here without a real API key -- these tests exercise OUR request-
building and response-parsing code by monkeypatching httpx.post, which is
a genuine test of this module's logic, not of OpenAI's API itself."""

import httpx
import pytest

from document_worker.embeddings import EmbeddingClient


class _FakeResponse:
    def __init__(self, json_body: dict, status_code: int = 200):
        self._json_body = json_body
        self.status_code = status_code

    def json(self) -> dict:
        return self._json_body

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)  # type: ignore[arg-type]


class TestEmbeddingClient:
    def test_요청에_모델과_input을_포함한다(self, monkeypatch):
        captured = {}

        def fake_post(url, headers=None, json=None, timeout=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return _FakeResponse(
                {
                    "object": "list",
                    "data": [{"object": "embedding", "index": 0, "embedding": [0.1, 0.2]}],
                    "model": "text-embedding-3-small",
                    "usage": {"prompt_tokens": 2, "total_tokens": 2},
                }
            )

        monkeypatch.setattr(httpx, "post", fake_post)
        client = EmbeddingClient(api_key="test-key", model="text-embedding-3-small")

        client.embed(["hello"])

        assert captured["url"] == "https://api.openai.com/v1/embeddings"
        assert captured["json"]["model"] == "text-embedding-3-small"
        assert captured["json"]["input"] == ["hello"]
        assert captured["headers"]["Authorization"] == "Bearer test-key"

    def test_응답에서_임베딩_벡터_목록을_순서대로_반환한다(self, monkeypatch):
        def fake_post(url, headers=None, json=None, timeout=None):
            return _FakeResponse(
                {
                    "object": "list",
                    "data": [
                        {"object": "embedding", "index": 0, "embedding": [0.1, 0.2]},
                        {"object": "embedding", "index": 1, "embedding": [0.3, 0.4]},
                    ],
                    "model": "text-embedding-3-small",
                    "usage": {"prompt_tokens": 4, "total_tokens": 4},
                }
            )

        monkeypatch.setattr(httpx, "post", fake_post)
        client = EmbeddingClient(api_key="test-key", model="text-embedding-3-small")

        vectors = client.embed(["a", "b"])

        assert vectors == [[0.1, 0.2], [0.3, 0.4]]

    def test_API_오류_응답이면_예외를_던진다(self, monkeypatch):
        def fake_post(url, headers=None, json=None, timeout=None):
            return _FakeResponse({"error": "boom"}, status_code=500)

        monkeypatch.setattr(httpx, "post", fake_post)
        client = EmbeddingClient(api_key="test-key", model="text-embedding-3-small")

        with pytest.raises(httpx.HTTPStatusError):
            client.embed(["hello"])
