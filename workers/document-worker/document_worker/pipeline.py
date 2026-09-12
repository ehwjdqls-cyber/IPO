"""Orchestrates one document through the state machine (spec section 33):
UPLOADED -> SCANNING -> EXTRACTING -> INDEXING -> READY|FAILED.

`process_document` takes its collaborators (repo/storage/scanner/embedder)
as plain duck-typed parameters rather than importing concrete psycopg/
boto3/httpx-backed implementations directly. That is what makes this
function's own sequencing and error-handling logic testable with fakes,
independent of any real Postgres/S3/OpenAI credentials -- see
tests/test_pipeline.py. There is deliberately no queue consumer wired to
this yet (Upstash QStash needs a publicly reachable webhook URL, which
doesn't exist in local development -- deferred per the Milestone 2 plan).
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from typing import Protocol

from .chunk import Chunk, chunk_text
from .extract import ExtractedPage, extract
from .malware_scan import ScanResult


@dataclass(frozen=True)
class DocumentRecord:
    id: str
    project_id: str
    organization_id: str
    storage_key: str
    media_type: str


class DocumentRepository(Protocol):
    def get_document(self, document_id: str) -> DocumentRecord: ...
    def update_status(self, document_id: str, status: str, **fields: object) -> None: ...
    def insert_pages(self, document_id: str, pages: list[ExtractedPage]) -> list[str]: ...
    def insert_chunks(
        self, document_id: str, page_id: str, chunks: list[Chunk], embeddings: list[list[float]]
    ) -> None: ...


class ObjectStorage(Protocol):
    def download(self, storage_key: str) -> bytes: ...


class MalwareScanner(Protocol):
    def scan(self, data: bytes) -> ScanResult: ...


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class ProcessingError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def process_document(
    document_id: str,
    *,
    repo: DocumentRepository,
    storage: ObjectStorage,
    scanner: MalwareScanner,
    embedder: Embedder,
) -> None:
    document = repo.get_document(document_id)

    data = storage.download(document.storage_key)

    repo.update_status(document_id, "SCANNING")
    scan_result = scanner.scan(data)
    if scan_result.is_infected:
        repo.update_status(
            document_id,
            "FAILED",
            failure_code="MALWARE_DETECTED",
            failure_message=f"malware detected: {scan_result.signature}",
        )
        return

    repo.update_status(document_id, "EXTRACTING")
    tmp_path = _write_temp_file(data)
    try:
        pages = extract(tmp_path, document.media_type)
    except Exception as exc:  # noqa: BLE001 -- any extractor failure maps to one error code
        repo.update_status(
            document_id, "FAILED", failure_code="EXTRACTION_FAILED", failure_message=str(exc)
        )
        return
    finally:
        os.unlink(tmp_path)

    page_ids = repo.insert_pages(document_id, pages)

    repo.update_status(document_id, "INDEXING")
    try:
        for page, page_id in zip(pages, page_ids, strict=True):
            chunks = chunk_text(page.text)
            if not chunks:
                continue
            embeddings = embedder.embed([chunk.content for chunk in chunks])
            repo.insert_chunks(document_id, page_id, chunks, embeddings)
    except Exception as exc:  # noqa: BLE001 -- any embedding/storage failure maps to one error code
        repo.update_status(
            document_id, "FAILED", failure_code="AI_PROVIDER_ERROR", failure_message=str(exc)
        )
        return

    repo.update_status(document_id, "READY")


def _write_temp_file(data: bytes) -> str:
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(data)
        return tmp.name
