"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../components/ui/button";
import { Input } from "../../../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../components/ui/select";

const CATEGORY_OPTIONS = [
  { value: "BUSINESS", label: "사업모델·성장성" },
  { value: "FINANCE", label: "재무·수익성" },
  { value: "CUSTOMER", label: "고객·거래처" },
  { value: "GOVERNANCE", label: "지배구조" },
  { value: "INTERNAL_CONTROL", label: "내부통제" },
  { value: "RISK", label: "주요 위험" },
];

const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "긴급" },
  { value: "HIGH", label: "높음" },
  { value: "MEDIUM", label: "보통" },
  { value: "LOW", label: "낮음" },
];

const EVIDENCE_STATUS_OPTIONS = [
  { value: "UNANSWERED", label: "미작성" },
  { value: "NEEDS_EVIDENCE", label: "근거 부족" },
  { value: "CONFLICT", label: "충돌" },
  { value: "PARTIAL", label: "일부 지원" },
  { value: "SUPPORTED", label: "지원됨" },
];

const REVIEW_STATUS_OPTIONS = [
  { value: "DRAFT", label: "초안" },
  { value: "NEEDS_REVIEW", label: "검토 대기" },
  { value: "APPROVED", label: "승인" },
  { value: "REJECTED", label: "반려" },
];

const ALL = "__all__";

export function QuestionsFilterToolbar({
  projectId,
  initialFilters,
}: {
  projectId: string;
  initialFilters: {
    search?: string;
    category?: string;
    priority?: string;
    evidenceStatus?: string;
    reviewStatus?: string;
  };
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [category, setCategory] = useState(initialFilters.category ?? ALL);
  const [priority, setPriority] = useState(initialFilters.priority ?? ALL);
  const [evidenceStatus, setEvidenceStatus] = useState(initialFilters.evidenceStatus ?? ALL);
  const [reviewStatus, setReviewStatus] = useState(initialFilters.reviewStatus ?? ALL);

  function apply(overrides: Record<string, string>) {
    const next = {
      search,
      category,
      priority,
      evidenceStatus,
      reviewStatus,
      ...overrides,
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== ALL) params.set(key, value);
    }
    router.push(`/projects/${projectId}/questions${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="질문 검색"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply({ search });
        }}
        className="w-48"
      />
      <Select
        value={category}
        onValueChange={(value) => {
          setCategory(value);
          apply({ category: value });
        }}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="카테고리" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>전체 카테고리</SelectItem>
          {CATEGORY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={priority}
        onValueChange={(value) => {
          setPriority(value);
          apply({ priority: value });
        }}
      >
        <SelectTrigger className="w-28">
          <SelectValue placeholder="중요도" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>전체 중요도</SelectItem>
          {PRIORITY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={evidenceStatus}
        onValueChange={(value) => {
          setEvidenceStatus(value);
          apply({ evidenceStatus: value });
        }}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="근거상태" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>전체 근거상태</SelectItem>
          {EVIDENCE_STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={reviewStatus}
        onValueChange={(value) => {
          setReviewStatus(value);
          apply({ reviewStatus: value });
        }}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="검토상태" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>전체 검토상태</SelectItem>
          {REVIEW_STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" size="sm" onClick={() => apply({ search })}>
        검색
      </Button>
    </div>
  );
}
