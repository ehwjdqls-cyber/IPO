import { NextResponse } from "next/server";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "INTERNAL_ERROR";

const statusByCode: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export function apiOk<T>(
  data: T,
  init?: { status?: number; requestId?: string; nextCursor?: string | null }
): NextResponse {
  const requestId = init?.requestId ?? crypto.randomUUID();
  return NextResponse.json(
    { data, meta: { requestId, nextCursor: init?.nextCursor ?? null } },
    { status: init?.status ?? 200, headers: { "X-Request-Id": requestId } }
  );
}

export function apiError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): NextResponse {
  const requestId = crypto.randomUUID();
  return NextResponse.json(
    { error: { code, message, requestId, details } },
    { status: statusByCode[code], headers: { "X-Request-Id": requestId } }
  );
}
