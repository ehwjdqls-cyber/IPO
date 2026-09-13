"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../../components/ui/button";

export function ReprocessButton({ projectId, documentId }: { projectId: string; documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleReprocess() {
    setBusy(true);
    await fetch(`/api/v1/projects/${projectId}/documents/${documentId}/reprocess`, {
      method: "POST",
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={handleReprocess} disabled={busy}>
      재처리
    </Button>
  );
}
