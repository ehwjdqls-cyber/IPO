import { z } from "zod";

export const ALLOWED_DOCUMENT_MEDIA_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const MAX_DOCUMENT_BYTES = 52_428_800; // 50MB, spec section US-02

const EXTENSION_BY_MEDIA_TYPE: Record<(typeof ALLOWED_DOCUMENT_MEDIA_TYPES)[number], string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

/**
 * Storage keys must stay ASCII-only -- Supabase Storage's S3 gateway
 * rejects keys built from the raw user-supplied filename once it contains
 * non-ASCII characters (Korean, brackets, etc.), confirmed via live upload
 * ("InvalidKey" from the storage API). The human-readable name is kept
 * separately in documents.original_filename for display; the storage key
 * only needs the extension, derived from the (already-validated) media
 * type rather than parsed out of untrusted user input.
 */
export function extensionForMediaType(
  mediaType: (typeof ALLOWED_DOCUMENT_MEDIA_TYPES)[number]
): string {
  return EXTENSION_BY_MEDIA_TYPE[mediaType];
}

const sha256Hex = z
  .string()
  .regex(/^[0-9a-f]{64}$/i, "SHA-256 해시는 64자리 16진수여야 합니다.");

export const createUploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mediaType: z.enum(ALLOWED_DOCUMENT_MEDIA_TYPES),
  byteSize: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  sha256: sha256Hex,
  allowDuplicate: z.boolean().optional(),
});
export type CreateUploadRequest = z.infer<typeof createUploadRequestSchema>;

export const completeUploadRequestSchema = z.object({
  sha256: sha256Hex,
  byteSize: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
});
export type CompleteUploadRequest = z.infer<typeof completeUploadRequestSchema>;

export const updateDocumentPageRequestSchema = z.object({
  excluded: z.boolean(),
});
export type UpdateDocumentPageRequest = z.infer<typeof updateDocumentPageRequestSchema>;
