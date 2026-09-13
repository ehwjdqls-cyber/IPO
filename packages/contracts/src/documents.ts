import { z } from "zod";

export const ALLOWED_DOCUMENT_MEDIA_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const MAX_DOCUMENT_BYTES = 52_428_800; // 50MB, spec section US-02

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
