"""Local dev-only job runner -- NOT used in CI or production.

Milestone 2 deliberately left the real queue consumer unwired (Upstash
QStash needs a publicly reachable webhook URL that doesn't exist in local
dev). This script fills that gap for manual local testing only: it drains
every QUEUED DOCUMENT_PROCESS job once against the real Postgres/Storage
this machine is configured for, then exits.

Two collaborators are dev-only stand-ins, never used by CI or production
code:
- `_LocalSkipScanner` -- always reports clean (no ClamAV/Docker here)
- `_LocalMockEmbedder` -- deterministic hash-based vectors, no OpenAI
  credits spent (the real EmbeddingClient in embeddings.py is untouched and
  still what production/CI use)

Retrieval quality on documents processed this way is meaningless (the
embeddings don't encode any actual semantics), but the pipeline's shape --
status transitions, page/chunk rows, vector column widths -- is exercised
for real. Run again after each upload; this does not loop or watch for new
jobs.

Usage: from workers/document-worker/, with the venv activated:
`python run_local.py`
Reads DATABASE_URL/OBJECT_STORAGE_* from apps/web/.env.local automatically
(same values `next dev` uses) -- no need to export them in the shell first,
which was a recurring source of "works in bash, not in PowerShell" friction.
Already-exported env vars still take precedence over the file.
"""

from __future__ import annotations

import hashlib
import os
import struct
import sys
from pathlib import Path

import psycopg

from document_worker.malware_scan import ScanResult
from document_worker.pipeline import process_document
from document_worker.repository import PostgresDocumentRepository
from document_worker.storage import S3ObjectStorage
from env_file import parse_env_file

# apps/web/.env.local, relative to this file -- same values `next dev`
# loads, so there is only one place to fill these in. Real environment
# variables (if already exported) always win over this file.
_ENV_LOCAL_PATH = Path(__file__).resolve().parent.parent.parent / "apps" / "web" / ".env.local"

EMBEDDING_DIMENSIONS = 1536  # matches document_chunks.embedding vector(1536)


class _LocalSkipScanner:
    """Dev-only stand-in for ClamAV -- always reports clean. See module
    docstring: this environment has no Docker/ClamAV to run a real scan."""

    def scan(self, data: bytes) -> ScanResult:
        return ScanResult(is_infected=False, signature=None, raw_response="local-dev-skip")


class _LocalMockEmbedder:
    """Dev-only stand-in for the real OpenAI-backed EmbeddingClient -- no AI
    billing/credits required. Deterministic per input text (hashed into
    floats in [-1, 1]) so re-running against the same content is stable, but
    NOT semantically meaningful: retrieval quality on locally-processed
    documents will be arbitrary, this only exercises the pipeline's shape
    (1536-dim vectors reaching document_chunks) end-to-end."""

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        vector: list[float] = []
        counter = 0
        while len(vector) < EMBEDDING_DIMENSIONS:
            digest = hashlib.sha256(f"{text}:{counter}".encode("utf-8")).digest()
            for i in range(0, len(digest) - 3, 4):
                if len(vector) >= EMBEDDING_DIMENSIONS:
                    break
                (as_uint,) = struct.unpack(">I", digest[i : i + 4])
                vector.append((as_uint / 0xFFFFFFFF) * 2 - 1)
            counter += 1
        return vector


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"Missing required env var: {name}", file=sys.stderr)
        sys.exit(1)
    return value


def _fetch_queued_document_jobs(dsn: str) -> list[tuple[str, str]]:
    with psycopg.connect(dsn) as conn:
        rows = conn.execute(
            "select id, input->>'documentId' as document_id from jobs "
            "where type = 'DOCUMENT_PROCESS' and status = 'QUEUED' "
            "order by created_at"
        ).fetchall()
        return [(str(row[0]), str(row[1])) for row in rows]


def _fetch_document_outcome(dsn: str, document_id: str) -> tuple[str, str | None, str | None]:
    with psycopg.connect(dsn) as conn:
        row = conn.execute(
            "select status, failure_code, failure_message from documents where id = %s",
            (document_id,),
        ).fetchone()
        return str(row[0]), row[1], row[2]


def _mark_job(dsn: str, job_id: str, status: str, *, error_code: str | None = None, error_message: str | None = None) -> None:
    with psycopg.connect(dsn) as conn:
        conn.execute(
            "update jobs set status = %s, progress = 100, finished_at = now(), "
            "started_at = coalesce(started_at, now()), attempts = attempts + 1, "
            "error_code = %s, error_message = %s where id = %s",
            (status, error_code, error_message, job_id),
        )
        conn.commit()


def _load_dotenv_defaults() -> None:
    for key, value in parse_env_file(_ENV_LOCAL_PATH).items():
        os.environ.setdefault(key, value)


def main() -> None:
    _load_dotenv_defaults()
    dsn = _require_env("DATABASE_URL")
    storage = S3ObjectStorage(
        endpoint_url=_require_env("OBJECT_STORAGE_ENDPOINT"),
        region=_require_env("OBJECT_STORAGE_REGION"),
        bucket=_require_env("OBJECT_STORAGE_BUCKET"),
        access_key_id=_require_env("OBJECT_STORAGE_ACCESS_KEY_ID"),
        secret_access_key=_require_env("OBJECT_STORAGE_SECRET_ACCESS_KEY"),
    )
    embedder = _LocalMockEmbedder()
    repo = PostgresDocumentRepository(dsn)
    scanner = _LocalSkipScanner()

    jobs = _fetch_queued_document_jobs(dsn)
    if not jobs:
        print("No QUEUED DOCUMENT_PROCESS jobs found.")
        return

    for job_id, document_id in jobs:
        print(f"Processing job {job_id} (document {document_id})...")
        try:
            # process_document() handles malware/extraction/embedding failures
            # internally (writes documents.status = FAILED and returns normally
            # rather than raising -- see pipeline.py), so the job's outcome has
            # to be read back from the document row, not inferred from whether
            # this call raised.
            process_document(document_id, repo=repo, storage=storage, scanner=scanner, embedder=embedder)
            status, failure_code, failure_message = _fetch_document_outcome(dsn, document_id)
            if status == "READY":
                _mark_job(dsn, job_id, "SUCCEEDED")
                print("  -> SUCCEEDED")
            else:
                _mark_job(dsn, job_id, "FAILED", error_code=failure_code, error_message=failure_message)
                print(f"  -> FAILED ({failure_code}): {failure_message}")
        except Exception as exc:  # noqa: BLE001 -- surface any unexpected error, still mark the job
            _mark_job(dsn, job_id, "FAILED", error_code="INTERNAL_ERROR", error_message=str(exc))
            print(f"  -> FAILED (INTERNAL_ERROR): {exc}")


if __name__ == "__main__":
    main()
