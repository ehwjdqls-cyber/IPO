"""Splits extracted page text into chunks for embedding/retrieval
(document_chunks.content/token_count, spec section 17).

Token counting here is a word-count approximation, not a real tokenizer:
the actual embedding/generation model (and therefore its exact tokenizer)
is chosen in Milestone 3's AI provider adapter, not yet decided. Re-chunking
against a real tokenizer is expected once that adapter exists -- this is
good enough to produce roughly-sized, retrievable chunks now.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    chunk_index: int
    content: str
    token_count: int


def _approximate_token_count(words: list[str]) -> int:
    return max(1, len(words))


def chunk_text(text: str, target_tokens: int = 400, overlap_tokens: int = 40) -> list[Chunk]:
    words = text.split()
    if not words:
        return []

    if overlap_tokens >= target_tokens:
        raise ValueError("overlap_tokens must be smaller than target_tokens")

    chunks: list[Chunk] = []
    start = 0
    chunk_index = 0
    while start < len(words):
        end = min(start + target_tokens, len(words))
        window = words[start:end]
        chunks.append(
            Chunk(
                chunk_index=chunk_index,
                content=" ".join(window),
                token_count=_approximate_token_count(window),
            )
        )
        chunk_index += 1
        if end == len(words):
            break
        start = end - overlap_tokens

    return chunks
