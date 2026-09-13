"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../components/ui/button";

export function DocumentRowActions({
  projectId,
  documentId,
}: {
  projectId: string;
  documentId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function handlePreview() {
    router.push(`/projects/${projectId}/documents/${documentId}`);
  }

  async function handleDownload() {
    setBusy(true);
    const response = await fetch(`/api/v1/projects/${projectId}/documents/${documentId}/download`);
    setBusy(false);
    if (!response.ok) {
      return;
    }
    const body = await response.json();
    window.open(body.data.url, "_blank");
  }

  async function handleReprocess() {
    setBusy(true);
    await fetch(`/api/v1/projects/${projectId}/documents/${documentId}/reprocess`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    setBusy(false);
    router.refresh();
  }

  async function handleDelete() {
    const input = window.prompt('이 문서를 삭제하려면 "삭제"를 입력해주세요.');
    if (input !== "삭제") {
      return;
    }
    setBusy(true);
    await fetch(`/api/v1/projects/${projectId}/documents/${documentId}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={handlePreview} disabled={busy}>
        미리보기
      </Button>
      <Button variant="outline" size="sm" onClick={handleReprocess} disabled={busy}>
        재처리
      </Button>
      <Button variant="outline" size="sm" onClick={handleDownload} disabled={busy}>
        다운로드
      </Button>
      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy}>
        삭제
      </Button>
    </div>
  );
}
