import "server-only";

export interface DocumentPageRow {
  id: string;
  document_id: string;
  page_number: number;
  extracted_text: string;
  extraction_confidence: string | null;
  excluded: boolean;
  created_at: string;
}

export interface DocumentPageDto {
  id: string;
  documentId: string;
  pageNumber: number;
  extractedText: string;
  extractionConfidence: number | null;
  excluded: boolean;
  createdAt: string;
}

export function toDocumentPageDto(row: DocumentPageRow): DocumentPageDto {
  return {
    id: row.id,
    documentId: row.document_id,
    pageNumber: row.page_number,
    extractedText: row.extracted_text,
    extractionConfidence: row.extraction_confidence === null ? null : Number(row.extraction_confidence),
    excluded: row.excluded,
    createdAt: row.created_at,
  };
}

export const DOCUMENT_PAGE_COLUMNS =
  "id, document_id, page_number, extracted_text, extraction_confidence, excluded, created_at";
