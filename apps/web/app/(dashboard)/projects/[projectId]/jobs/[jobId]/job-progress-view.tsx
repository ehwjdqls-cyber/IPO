"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../../components/ui/button";
import { Badge } from "../../../../../../components/ui/badge";

export interface JobSnapshot {
  id: string;
  type: string;
  status: string;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  QUEUED: "대기 중",
  RUNNING: "진행 중",
  SUCCEEDED: "완료",
  FAILED: "실패",
  CANCELLED: "취소됨",
};

const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

function formatTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export function JobProgressView({
  projectId,
  initialJob,
  canManage,
}: {
  projectId: string;
  initialJob: JobSnapshot;
  canManage: boolean;
}) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (TERMINAL_STATUSES.has(job.status)) {
      return;
    }
    const interval = setInterval(async () => {
      const response = await fetch(`/api/v1/projects/${projectId}/jobs/${job.id}`);
      if (!response.ok) return;
      const body = await response.json();
      setJob(body.data);
    }, 3000);
    return () => clearInterval(interval);
  }, [projectId, job.id, job.status]);

  async function handleCancel() {
    setBusy(true);
    const response = await fetch(`/api/v1/projects/${projectId}/jobs/${job.id}/cancel`, {
      method: "POST",
    });
    setBusy(false);
    if (response.ok) {
      const body = await response.json();
      setJob((prev) => ({ ...prev, status: body.data.status }));
    }
  }

  async function handleRetry() {
    setBusy(true);
    const response = await fetch(`/api/v1/projects/${projectId}/jobs/${job.id}/retry`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    setBusy(false);
    if (response.ok) {
      const body = await response.json();
      router.push(`/projects/${projectId}/jobs/${body.data.id}`);
    }
  }

  const events = [
    { label: "생성됨", at: job.createdAt },
    ...(job.startedAt ? [{ label: "시작됨", at: job.startedAt }] : []),
    ...(job.finishedAt ? [{ label: STATUS_LABEL[job.status] ?? job.status, at: job.finishedAt }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant={job.status === "FAILED" ? "destructive" : "default"}>
          {STATUS_LABEL[job.status] ?? job.status}
        </Badge>
        <div className="flex gap-2">
          {canManage && !TERMINAL_STATUSES.has(job.status) && (
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={busy}>
              취소
            </Button>
          )}
          {canManage && job.status === "FAILED" && (
            <Button variant="outline" size="sm" onClick={handleRetry} disabled={busy}>
              재시도
            </Button>
          )}
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuenow={job.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${job.progress}%` }}
        />
      </div>

      {job.status === "FAILED" && job.errorMessage && (
        <p className="text-sm text-destructive">{job.errorMessage}</p>
      )}

      <ul className="space-y-1 text-sm">
        {events.map((event) => (
          <li key={event.label} className="flex justify-between">
            <span className="text-foreground">{event.label}</span>
            <span className="text-muted-foreground">{formatTime(event.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
