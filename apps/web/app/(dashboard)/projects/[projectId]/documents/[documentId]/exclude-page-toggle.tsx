"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "../../../../../../components/ui/checkbox";

export function ExcludePageToggle({
  projectId,
  documentId,
  pageId,
  excluded,
}: {
  projectId: string;
  documentId: string;
  pageId: string;
  excluded: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleChange(checked: boolean) {
    setBusy(true);
    await fetch(`/api/v1/projects/${projectId}/documents/${documentId}/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excluded: checked }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <Checkbox
        checked={excluded}
        disabled={busy}
        onCheckedChange={(checked) => handleChange(checked === true)}
      />
      이 페이지 제외
    </label>
  );
}
