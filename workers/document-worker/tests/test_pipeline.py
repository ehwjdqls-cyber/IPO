"""process_document() is tested here with fake repo/storage/scanner/embedder
collaborators -- this verifies OUR sequencing and error-handling logic for
real. The concrete (psycopg/boto3-backed) implementations of those
collaborators are separate modules this session cannot verify against
live infra (no Postgres/S3 credentials here) -- see repository.py and
storage.py's module docstrings.
"""

import pymupdf
import pytest

from document_worker.malware_scan import ScanResult
from document_worker.pipeline import DocumentRecord, ProcessingError, process_document


def make_synthetic_pdf_bytes() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "synthetic pdf body text for pipeline test")
    data = doc.tobytes()
    doc.close()
    return data


class FakeStorage:
    def __init__(self, data: bytes):
        self._data = data
        self.downloaded_keys: list[str] = []

    def download(self, storage_key: str) -> bytes:
        self.downloaded_keys.append(storage_key)
        return self._data


class FakeScanner:
    def __init__(self, is_infected: bool = False, signature: str | None = None):
        self._result = ScanResult(is_infected=is_infected, signature=signature, raw_response="")
        self.scanned = False

    def scan(self, data: bytes) -> ScanResult:
        self.scanned = True
        return self._result


class RaisingEmbedder:
    def embed(self, texts: list[str]) -> list[list[float]]:
        raise RuntimeError("AI provider unreachable")


class FakeEmbedder:
    def __init__(self):
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [[0.1, 0.2, 0.3] for _ in texts]


class FakeRepo:
    def __init__(self, document: DocumentRecord):
        self._document = document
        self.status_history: list[tuple[str, dict]] = []
        self.pages: list[object] = []
        self.chunk_calls: list[tuple[str, list, list]] = []

    def get_document(self, document_id: str) -> DocumentRecord:
        return self._document

    def update_status(self, document_id: str, status: str, **fields) -> None:
        self.status_history.append((status, fields))

    def insert_pages(self, document_id: str, pages: list) -> list[str]:
        self.pages = pages
        return [f"page-{i}" for i in range(len(pages))]

    def insert_chunks(self, document_id: str, page_id: str, chunks: list, embeddings: list) -> None:
        self.chunk_calls.append((page_id, chunks, embeddings))


DOCUMENT = DocumentRecord(
    id="doc-1",
    project_id="project-1",
    organization_id="org-1",
    storage_key="org-1/project-1/doc-1/report.pdf",
    media_type="application/pdf",
)


class TestProcessDocumentHappyPath:
    def test_정상_문서는_READY까지_전체_파이프라인을_통과한다(self):
        storage = FakeStorage(make_synthetic_pdf_bytes())
        scanner = FakeScanner(is_infected=False)
        embedder = FakeEmbedder()
        repo = FakeRepo(DOCUMENT)

        process_document(DOCUMENT.id, repo=repo, storage=storage, scanner=scanner, embedder=embedder)

        statuses = [s for s, _ in repo.status_history]
        assert statuses == ["SCANNING", "EXTRACTING", "INDEXING", "READY"]
        assert storage.downloaded_keys == [DOCUMENT.storage_key]
        assert scanner.scanned is True
        assert len(repo.pages) == 1
        assert len(repo.chunk_calls) == 1
        assert len(embedder.calls) == 1
        indexing_fields = repo.status_history[2][1]
        assert indexing_fields["page_count"] == 1


class TestProcessDocumentMalware:
    def test_악성파일_탐지시_추출을_시도하지_않고_FAILED로_전환한다(self):
        storage = FakeStorage(b"irrelevant bytes")
        scanner = FakeScanner(is_infected=True, signature="Win.Test.EICAR_HDB-1")
        embedder = FakeEmbedder()
        repo = FakeRepo(DOCUMENT)

        process_document(DOCUMENT.id, repo=repo, storage=storage, scanner=scanner, embedder=embedder)

        statuses = [s for s, _ in repo.status_history]
        assert statuses == ["SCANNING", "FAILED"]
        failed_fields = repo.status_history[-1][1]
        assert failed_fields["failure_code"] == "MALWARE_DETECTED"
        assert repo.pages == []
        assert embedder.calls == []


class TestProcessDocumentExtractionFailure:
    def test_추출_실패시_EXTRACTION_FAILED로_전환한다(self):
        storage = FakeStorage(b"not a real pdf at all")
        scanner = FakeScanner(is_infected=False)
        embedder = FakeEmbedder()
        repo = FakeRepo(DOCUMENT)

        process_document(DOCUMENT.id, repo=repo, storage=storage, scanner=scanner, embedder=embedder)

        statuses = [s for s, _ in repo.status_history]
        assert statuses == ["SCANNING", "EXTRACTING", "FAILED"]
        assert repo.status_history[-1][1]["failure_code"] == "EXTRACTION_FAILED"


class TestProcessDocumentEmbeddingFailure:
    def test_임베딩_실패시_AI_PROVIDER_ERROR로_전환한다(self):
        storage = FakeStorage(make_synthetic_pdf_bytes())
        scanner = FakeScanner(is_infected=False)
        repo = FakeRepo(DOCUMENT)

        process_document(
            DOCUMENT.id, repo=repo, storage=storage, scanner=scanner, embedder=RaisingEmbedder()
        )

        statuses = [s for s, _ in repo.status_history]
        assert statuses == ["SCANNING", "EXTRACTING", "INDEXING", "FAILED"]
        assert repo.status_history[-1][1]["failure_code"] == "AI_PROVIDER_ERROR"
