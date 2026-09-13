"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../components/ui/button";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_BYTES = 52_428_800; // 50MB, spec US-02

interface UploadSession {
  uploadId: string;
  putUrl: string;
  requiredHeaders: Record<string, string>;
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function UploadForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createSession(
    file: File,
    sha256: string,
    allowDuplicate: boolean
  ): Promise<UploadSession | null> {
    const response = await fetch(`/api/v1/projects/${projectId}/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        mediaType: file.type,
        byteSize: file.size,
        sha256,
        allowDuplicate: allowDuplicate || undefined,
      }),
    });

    if (response.status === 409 && !allowDuplicate) {
      const proceed = window.confirm(
        "동일한 내용의 파일이 이미 업로드되어 있습니다. 새 버전으로 업로드할까요?"
      );
      if (!proceed) {
        return null;
      }
      return createSession(file, sha256, true);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error?.message ?? "업로드 세션 생성에 실패했습니다.");
    }

    const body = await response.json();
    return body.data as UploadSession;
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("PDF, DOCX, XLSX만 지원합니다.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("파일은 50MB 이하여야 합니다.");
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const sha256 = await sha256Hex(file);
      const session = await createSession(file, sha256, false);
      if (!session) {
        return;
      }

      const putResponse = await fetch(session.putUrl, {
        method: "PUT",
        headers: session.requiredHeaders,
        body: file,
      });
      if (!putResponse.ok) {
        throw new Error("파일 업로드에 실패했습니다.");
      }

      const completeResponse = await fetch(
        `/api/v1/projects/${projectId}/uploads/${session.uploadId}/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ sha256, byteSize: file.size }),
        }
      );
      if (!completeResponse.ok) {
        throw new Error("업로드 완료 처리에 실패했습니다.");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="text-right">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={handleFileChange}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? "업로드 중..." : "문서 업로드"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
