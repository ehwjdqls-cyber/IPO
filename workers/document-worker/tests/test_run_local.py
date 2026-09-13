"""run_local.py is dev-only tooling (not wired into CI), but its mock
embedder still needs the right shape or it silently breaks the
document_chunks.embedding vector(1536) column -- worth a quick check."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from run_local import _LocalMockEmbedder, _LocalSkipScanner  # noqa: E402


class TestLocalMockEmbedder:
    def test_1536차원_벡터를_반환한다(self):
        embedder = _LocalMockEmbedder()

        result = embedder.embed(["hello", "world"])

        assert len(result) == 2
        assert all(len(vector) == 1536 for vector in result)

    def test_같은_텍스트는_같은_벡터를_반환한다(self):
        embedder = _LocalMockEmbedder()

        first = embedder.embed(["같은 텍스트"])
        second = embedder.embed(["같은 텍스트"])

        assert first == second

    def test_다른_텍스트는_다른_벡터를_반환한다(self):
        embedder = _LocalMockEmbedder()

        result = embedder.embed(["텍스트 A", "텍스트 B"])

        assert result[0] != result[1]


class TestLocalSkipScanner:
    def test_항상_감염되지_않았다고_보고한다(self):
        scanner = _LocalSkipScanner()

        result = scanner.scan(b"anything")

        assert result.is_infected is False
