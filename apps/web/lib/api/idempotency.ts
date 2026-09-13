/**
 * spec 18절: "작업 생성 POST는 Idempotency-Key 헤더 필수." Applied to
 * endpoints that create a `jobs` row (upload-complete, reprocess, retry),
 * not plain resource-creation POSTs like /projects.
 */
export function getIdempotencyKey(request: Request): string | null {
  const value = request.headers.get("Idempotency-Key");
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
