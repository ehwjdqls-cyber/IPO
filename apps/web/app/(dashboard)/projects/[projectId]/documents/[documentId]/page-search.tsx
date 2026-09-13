"use client";

import { useMemo, useState } from "react";

export interface PageSummary {
  id: string;
  pageNumber: number;
  excluded: boolean;
  preview: string;
}

export function PageSearch({ pages }: { pages: PageSummary[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) => String(p.pageNumber).includes(q) || p.preview.toLowerCase().includes(q)
    );
  }, [pages, query]);

  return (
    <div className="space-y-2">
      <input
        type="search"
        placeholder="페이지 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      />
      <ul className="space-y-1">
        {filtered.map((p) => (
          <li key={p.id}>
            <a
              href={`#page-${p.pageNumber}`}
              className={`block rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                p.excluded ? "text-muted-foreground line-through" : "text-foreground"
              }`}
            >
              {p.pageNumber}쪽 {p.excluded && "(제외됨)"}
            </a>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">검색 결과가 없습니다.</li>
        )}
      </ul>
    </div>
  );
}
