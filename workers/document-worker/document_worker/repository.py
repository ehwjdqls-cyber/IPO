"""psycopg-backed DocumentRepository. Connects as the service/migration-
owner role and bypasses RLS by table ownership -- same design as
packages/db/src/client.ts#createServiceClient -- because the worker acts
on one already-authorized document_id, not on behalf of an interactive
user session with an organization_id/user_id scope to enforce.

NOT verified against a real Postgres in this session: there is no live
database reachable here beyond the pglite-based TS test harness, which
this Python code has no way to use. Structurally reviewed only, same
honesty caveat as malware_scan.py and storage.py.
"""

from __future__ import annotations

import hashlib

import psycopg

from .chunk import Chunk
from .extract import ExtractedPage
from .pipeline import DocumentRecord


def _embedding_literal(embedding: list[float]) -> str:
    """pgvector accepts its `vector` type as a bracketed text literal
    (e.g. '[0.1,0.2,0.3]') cast with ::vector -- avoids depending on the
    separate pgvector-python package just to send one INSERT value."""
    return "[" + ",".join(repr(v) for v in embedding) + "]"


class PostgresDocumentRepository:
    def __init__(self, dsn: str):
        self._dsn = dsn

    def get_document(self, document_id: str) -> DocumentRecord:
        with psycopg.connect(self._dsn) as conn:
            row = conn.execute(
                "select id, project_id, organization_id, storage_key, media_type "
                "from documents where id = %s",
                (document_id,),
            ).fetchone()
        if row is None:
            raise ValueError(f"document not found: {document_id}")
        return DocumentRecord(
            id=str(row[0]),
            project_id=str(row[1]),
            organization_id=str(row[2]),
            storage_key=row[3],
            media_type=row[4],
        )

    def update_status(self, document_id: str, status: str, **fields: object) -> None:
        set_clauses = ["status = %s", "updated_at = now()"]
        params: list[object] = [status]
        for key in ("failure_code", "failure_message"):
            if key in fields:
                set_clauses.append(f"{key} = %s")
                params.append(fields[key])
        params.append(document_id)
        with psycopg.connect(self._dsn) as conn:
            conn.execute(f"update documents set {', '.join(set_clauses)} where id = %s", params)
            conn.commit()

    def insert_pages(self, document_id: str, pages: list[ExtractedPage]) -> list[str]:
        ids: list[str] = []
        with psycopg.connect(self._dsn) as conn:
            for page in pages:
                row = conn.execute(
                    "insert into document_pages (document_id, page_number, extracted_text) "
                    "values (%s, %s, %s) returning id",
                    (document_id, page.page_number, page.text),
                ).fetchone()
                ids.append(str(row[0]))
            conn.commit()
        return ids

    def insert_chunks(
        self, document_id: str, page_id: str, chunks: list[Chunk], embeddings: list[list[float]]
    ) -> None:
        with psycopg.connect(self._dsn) as conn:
            doc_row = conn.execute(
                "select organization_id, project_id from documents where id = %s", (document_id,)
            ).fetchone()
            organization_id, project_id = doc_row[0], doc_row[1]
            for chunk, embedding in zip(chunks, embeddings, strict=True):
                content_sha256 = hashlib.sha256(chunk.content.encode("utf-8")).hexdigest()
                conn.execute(
                    """
                    insert into document_chunks
                        (organization_id, project_id, document_id, page_id, chunk_index,
                         content, content_sha256, token_count, embedding)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s::vector)
                    """,
                    (
                        organization_id,
                        project_id,
                        document_id,
                        page_id,
                        chunk.chunk_index,
                        chunk.content,
                        content_sha256,
                        chunk.token_count,
                        _embedding_literal(embedding),
                    ),
                )
            conn.commit()
