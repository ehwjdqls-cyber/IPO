"""OpenAI-compatible embeddings client (spec section 13: "OpenAI Responses
API 호환 어댑터", section 22: 임베딩 1,536차원 고정).

Endpoint/request/response shape confirmed against the official OpenAI API
docs (POST /v1/embeddings, body {model, input, ...}, response
{data: [{embedding, index, object}], ...}) -- text-embedding-3-small is
the model with a 1536-dimension default output the spec calls for. The
exact model name is still an env var (AI_EMBEDDING_MODEL_SNAPSHOT, per
packages/contracts/src/env.ts), not hardcoded here.
"""

from __future__ import annotations

import httpx


class EmbeddingClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 30.0,
    ):
        self._api_key = api_key
        self._model = model
        self._base_url = base_url
        self._timeout = timeout

    def embed(self, texts: list[str]) -> list[list[float]]:
        response = httpx.post(
            f"{self._base_url}/embeddings",
            headers={"Authorization": f"Bearer {self._api_key}"},
            json={"model": self._model, "input": texts},
            timeout=self._timeout,
        )
        response.raise_for_status()
        body = response.json()
        by_index = sorted(body["data"], key=lambda item: item["index"])
        return [item["embedding"] for item in by_index]
