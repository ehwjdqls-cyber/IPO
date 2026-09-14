import { describe, expect, it } from "vitest";
import { validateAnswerOutput, type AnswerGenerationOutput } from "../src/answer-generation";
import type { RetrievedChunkForPrompt } from "../src/question-generation";

/**
 * Spec 28절 "AI 평가 세트": 최소 100개 비식별 질문·근거 쌍을 버전 관리하며
 * citation precision/completeness, quote faithfulness, unsupported claim
 * rate, tenant leakage, conflict recall, Korean quality를 고정 세트로
 * 회귀평가한다.
 *
 * 이 파일은 그 스펙의 축소된 스캐폴드다 -- 진짜 100개 비식별 질문·근거 쌍과
 * "전문가 5점 척도" Korean quality 평가는 실제 고객 문서와 사람 리뷰가
 *필요해서 이 저장소만으로는 만들 수 없다(AI 생성 자체도 이번 개발 단계에서
 * mock 처리 중이라 실제 모델 출력이 없다). 대신 validateAnswerOutput()이
 * 실제로 강제해야 하는 불변조건들을 합성 픽스처로 고정해, 프롬프트/스키마/
 * 검증 로직이 바뀔 때 회귀를 잡아낸다: citation 환각 방지, 인용문 위조 방지,
 * 근거 없는 factual claim의 SUPPORTED 승격 방지, 충돌 탐지, 그리고 이
 * 픽스처 세트 전체에 대한 spec 28절 수치 계산.
 *
 * tenant leakage(0건)는 이 파일이 아니라 retrieval.test.ts에서
 * hybridSearch() 자체에 대해 adversarial하게 검증한다 -- validateAnswerOutput
 * 은 이미 격리된 retrieval 결과만 받으므로 여기서 재현할 수 없는 종류의
 * 불변조건이다.
 */

function chunk(chunkId: string, content: string): RetrievedChunkForPrompt {
  return { chunkId, documentId: "doc-1", pageNumber: 1, content };
}

interface EvalCase {
  name: string;
  retrievalSet: RetrievedChunkForPrompt[];
  rawOutput: AnswerGenerationOutput;
  /** 합성 충돌 세트 여부 -- conflict recall 계산 대상. */
  expectsConflict?: boolean;
}

const CASES: EvalCase[] = [
  {
    name: "정상 답변: 인용이 실제로 청크 본문의 부분문자열이다",
    retrievalSet: [chunk("c1", "2025년 매출액은 120억원입니다.")],
    rawOutput: {
      answerMarkdown: "2025년 매출액은 120억원입니다.",
      evidenceStatus: "SUPPORTED",
      claims: [
        {
          claimText: "2025년 매출액은 120억원이다.",
          isFactual: true,
          evidenceStatus: "SUPPORTED",
          citations: [{ evidenceChunkId: "c1", quoteText: "매출액은 120억원", verdict: "SUPPORTS" }],
        },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    },
  },
  {
    name: "환각 citation: 존재하지 않는 chunk_id를 참조하면 제거되고 NEEDS_EVIDENCE로 강등된다",
    retrievalSet: [chunk("c1", "2025년 매출액은 120억원입니다.")],
    rawOutput: {
      answerMarkdown: "2025년 영업이익은 30억원입니다.",
      evidenceStatus: "SUPPORTED",
      claims: [
        {
          claimText: "2025년 영업이익은 30억원이다.",
          isFactual: true,
          evidenceStatus: "SUPPORTED",
          citations: [{ evidenceChunkId: "nonexistent-chunk", quoteText: "영업이익은 30억원", verdict: "SUPPORTS" }],
        },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    },
  },
  {
    name: "위조 인용문: chunk에 실제로 없는 문구를 인용하면 제거되고 NEEDS_EVIDENCE로 강등된다",
    retrievalSet: [chunk("c1", "2025년 매출액은 120억원입니다.")],
    rawOutput: {
      answerMarkdown: "2025년 순이익은 50억원입니다.",
      evidenceStatus: "SUPPORTED",
      claims: [
        {
          claimText: "2025년 순이익은 50억원이다.",
          isFactual: true,
          evidenceStatus: "SUPPORTED",
          citations: [{ evidenceChunkId: "c1", quoteText: "순이익은 50억원", verdict: "SUPPORTS" }],
        },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    },
  },
  {
    name: "근거 없는 factual claim은 원본이 SUPPORTED라고 우겨도 NEEDS_EVIDENCE로 강제된다",
    retrievalSet: [chunk("c1", "2025년 매출액은 120억원입니다.")],
    rawOutput: {
      answerMarkdown: "당사는 업계 1위입니다.",
      evidenceStatus: "SUPPORTED",
      claims: [
        {
          claimText: "당사는 업계 1위이다.",
          isFactual: true,
          evidenceStatus: "SUPPORTED",
          citations: [],
        },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    },
  },
  {
    name: "비사실(opinion) claim은 근거가 없어도 강등되지 않는다",
    retrievalSet: [chunk("c1", "2025년 매출액은 120억원입니다.")],
    rawOutput: {
      answerMarkdown: "이는 긍정적인 신호로 보입니다.",
      evidenceStatus: "SUPPORTED",
      claims: [
        {
          claimText: "이는 긍정적인 신호로 보인다.",
          isFactual: false,
          evidenceStatus: "SUPPORTED",
          citations: [],
        },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    },
  },
  {
    name: "합성 충돌 세트: 두 문서가 서로 다른 매출액을 제시하면 CONFLICT로 집계된다",
    retrievalSet: [
      chunk("c1", "2025년 매출액은 120억원입니다."),
      chunk("c2", "2025년 매출액은 150억원으로 정정합니다."),
    ],
    rawOutput: {
      answerMarkdown: "문서마다 매출액이 다르게 기재되어 있습니다.",
      evidenceStatus: "CONFLICT",
      claims: [
        {
          claimText: "2025년 매출액은 문서에 따라 120억원 또는 150억원으로 기재되어 있다.",
          isFactual: true,
          evidenceStatus: "CONFLICT",
          citations: [
            { evidenceChunkId: "c1", quoteText: "매출액은 120억원", verdict: "CONFLICTS" },
            { evidenceChunkId: "c2", quoteText: "매출액은 150억원으로 정정", verdict: "CONFLICTS" },
          ],
        },
      ],
      dataGaps: [],
      conflicts: ["매출액 수치 불일치"],
      followUpQuestions: [],
    },
    expectsConflict: true,
  },
  {
    name: "일부 지지: 인용은 있으나 verdict가 PARTIAL이면 PARTIAL로 유지된다",
    retrievalSet: [chunk("c1", "2025년 매출은 전년 대비 소폭 증가했습니다.")],
    rawOutput: {
      answerMarkdown: "2025년 매출은 전년 대비 증가한 것으로 보입니다.",
      evidenceStatus: "PARTIAL",
      claims: [
        {
          claimText: "2025년 매출은 전년 대비 증가했다.",
          isFactual: true,
          evidenceStatus: "PARTIAL",
          citations: [{ evidenceChunkId: "c1", quoteText: "전년 대비 소폭 증가", verdict: "PARTIAL" }],
        },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    },
  },
];

describe("AI 회귀평가 스캐폴드 (spec 28절 축소판)", () => {
  const results = CASES.map((c) => ({
    ...c,
    validated: validateAnswerOutput(c.rawOutput, c.retrievalSet),
  }));

  it("환각 citation(존재하지 않는 chunk_id)은 항상 제거된다", () => {
    const hallucinated = results.find((r) => r.name.includes("환각"));
    expect(hallucinated?.validated.claims[0]?.citations).toHaveLength(0);
  });

  it("위조 인용문(청크에 없는 문구)은 항상 제거된다", () => {
    const forged = results.find((r) => r.name.includes("위조"));
    expect(forged?.validated.claims[0]?.citations).toHaveLength(0);
  });

  it("factual claim은 citation이 없으면 SUPPORTED가 될 수 없다 (spec 32절 핵심 불변조건)", () => {
    for (const r of results) {
      for (const claim of r.validated.claims) {
        if (claim.isFactual && claim.citations.length === 0) {
          expect(claim.evidenceStatus).toBe("NEEDS_EVIDENCE");
        }
      }
    }
  });

  it("비사실(opinion) claim은 근거 없이도 원래 상태를 유지한다", () => {
    const opinion = results.find((r) => r.name.includes("비사실"));
    expect(opinion?.validated.claims[0]?.evidenceStatus).toBe("SUPPORTED");
  });

  it("Citation precision 계산이 의도한 값과 일치한다 (spec 28절 표: 실제 100쌍 세트 기준은 >= 0.95)", () => {
    const totalCitations = results.flatMap((r) => r.rawOutput.claims.flatMap((c) => c.citations)).length;
    const survivingCitations = results.flatMap((r) => r.validated.claims.flatMap((c) => c.citations)).length;
    const precision = survivingCitations / totalCitations;
    // 이 축소판 픽스처는 검증 로직을 시험하려고 나쁜 인용을 일부러 섞어
    // 뒀으므로(환각 1건, 위조 1건 / 총 6건 원본 인용), spec 28절의 0.95
    // 문턱을 이 픽스처 세트에 그대로 적용할 수는 없다 -- 대신 "정확히
    // 4/6이 살아남는지"를 고정해 계산 자체의 회귀를 잡는다. 실제 100쌍
    // 평가 세트에서는 여전히 >= 0.95가 릴리스 기준이다.
    expect(totalCitations).toBe(6);
    expect(survivingCitations).toBe(4);
    expect(precision).toBeCloseTo(4 / 6, 10);
  });

  it("Unsupported claim rate <= 0.02, 목표 0 (factual claim 중 NEEDS_EVIDENCE 비율)", () => {
    const factualClaims = results.flatMap((r) => r.validated.claims).filter((c) => c.isFactual);
    const unsupported = factualClaims.filter((c) => c.evidenceStatus === "NEEDS_EVIDENCE");
    // 이 축소판 픽스처는 검증 로직 자체를 시험하려고 일부러 근거 없는
    // factual claim을 섞어뒀으므로 spec 28절의 0.02 문턱과 직접 비교하지
    // 않는다 -- 대신 "제거되어야 할 나쁜 사례가 실제로 제거됐는지"만 고정한다.
    expect(unsupported.length).toBe(3); // 환각 citation 1건 + 위조 인용문 1건 + 근거 없는 factual claim 1건
  });

  it("Conflict recall >= 0.90 (합성 충돌 세트에서 CONFLICT로 정확히 집계)", () => {
    const conflictCases = results.filter((r) => r.expectsConflict);
    const recalled = conflictCases.filter((r) => r.validated.evidenceStatus === "CONFLICT");
    expect(conflictCases.length).toBeGreaterThan(0);
    expect(recalled.length / conflictCases.length).toBeGreaterThanOrEqual(0.9);
  });

  it("Quote faithfulness = 1.00 (검증을 통과한 인용문은 전부 정규화된 부분문자열이다)", () => {
    const normalize = (text: string) => text.replace(/\s+/g, "");
    for (const r of results) {
      const chunkById = new Map(r.retrievalSet.map((c) => [c.chunkId, c]));
      for (const claim of r.validated.claims) {
        for (const citation of claim.citations) {
          const sourceChunk = chunkById.get(citation.evidenceChunkId);
          expect(sourceChunk).toBeDefined();
          expect(normalize(sourceChunk!.content)).toContain(normalize(citation.quoteText));
        }
      }
    }
  });
});
