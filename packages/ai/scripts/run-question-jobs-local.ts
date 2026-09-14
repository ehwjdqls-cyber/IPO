/**
 * Local dev-only job runner -- NOT used in CI or production. Mirrors
 * workers/document-worker/run_local.py's role for DOCUMENT_PROCESS jobs,
 * but for QUESTION_GENERATE: Milestone 2 deliberately left the real queue
 * consumer unwired (no publicly reachable QStash webhook URL in local
 * dev), and that gap applies to every job type, not just document
 * processing.
 *
 * Drains every QUEUED QUESTION_GENERATE job once against the real
 * Postgres this machine is configured for, then exits. Run again after
 * each "생성" click.
 *
 * Calls the real generateQuestions() (src/question-generation.ts) by
 * default -- an actual OpenAI request, actual cost. mockGenerateQuestions()
 * remains as a free, deterministic fallback for offline development or
 * exercising the pipeline's shape without an API key: pass --mock to use
 * it instead.
 *
 * Writes directly via the same superuser DATABASE_URL connection
 * migrate-cli.ts uses (bypasses RLS by table ownership, same as the
 * Python document worker's writes to document_pages/document_chunks) --
 * this script is a trusted background process, not a live user session,
 * and the job it's processing was already authenticated/RLS-checked at
 * creation time (POST /question-jobs). created_by on every inserted row
 * is pinned to that job's own created_by, not re-derived here.
 *
 * Usage: from packages/ai/, with the workspace installed:
 * `npx tsx scripts/run-question-jobs-local.ts` (real API, needs AI_API_KEY)
 * `npx tsx scripts/run-question-jobs-local.ts --mock` (free, deterministic)
 * Reads DATABASE_URL/AI_API_KEY/AI_GENERATION_MODEL_SNAPSHOT from
 * apps/web/.env.local automatically.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { QUESTION_CATEGORIES, type QuestionCategory } from "@ipo/contracts";
import { parseEnvFile } from "./env-file";
import {
  generateQuestions,
  questionGenerationOutputSchema,
  type GeneratedQuestion,
  type RetrievedChunkForPrompt,
} from "../src/question-generation";

const ENV_LOCAL_PATH = path.resolve(import.meta.dirname, "../../../apps/web/.env.local");
const MAX_CHUNKS_PER_JOB = 40; // keeps the mock (and a real prompt, later) a bounded size

function loadDotenvDefaults(): void {
  for (const [key, value] of Object.entries(parseEnvFile(ENV_LOCAL_PATH))) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/** Slices to maxLength but, only when that actually cut the content short,
 * backs off to the last space -- so a trailing partial word (e.g. "...31일
 * 현" cut mid-word out of "현재") never becomes its own dangling FTS token.
 * Content that already fits within maxLength is returned as-is (no reason
 * to drop its last word). */
function safeExcerpt(content: string, maxLength = 60): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const sliced = trimmed.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  return lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
}

export function mockGenerateQuestions(params: {
  categories: string[];
  questionCount: number;
  chunks: RetrievedChunkForPrompt[];
}): GeneratedQuestion[] {
  if (params.chunks.length === 0) {
    return [];
  }
  const categories = params.categories.filter((c): c is QuestionCategory =>
    (QUESTION_CATEGORIES as readonly string[]).includes(c)
  );
  if (categories.length === 0) {
    return [];
  }

  const questions: GeneratedQuestion[] = [];
  for (let i = 0; i < params.questionCount; i++) {
    const category = categories[i % categories.length]!;
    const chunk = params.chunks[i % params.chunks.length]!;
    questions.push({
      category,
      // "※"는 순수 기호라 to_tsvector가 lexeme을 만들지 않는다(직접 확인함) --
      // 나머지는 문서에 없는 단어를 추가하면 안 된다: run-answer-jobs-local.ts가
      // 이 question_text 전체를 그대로 plainto_tsquery에 넘기는데, 그건 모든
      // 단어를 AND로 묶으므로 "관련"/"확인"/"질문입니다"/카테고리명처럼 문서에
      // 없는 단어가 하나라도 섞이면 실제로 인용한 청크조차 매칭에 실패한다.
      // slice(0, 60)로 단어 중간이 잘리면(예: "현재"의 "현"만 남음) 그 조각
      // 자체가 문서 어디에도 없는 토큰이 되어 역시 AND 매칭이 깨지므로,
      // 마지막 공백까지 되잘라 완전한 토큰만 남긴다(직접 확인함).
      // questionGenerationOutputSchema가 question.min(10)을 요구하므로, 청크가
      // 아주 짧을 때(테스트 픽스처 등)도 lexeme 없는 "※"로 패딩해 길이를 채운다.
      question: `※ ${safeExcerpt(chunk.content) || "본문"}`.padEnd(10, "※"),
      rationale: `문서 ${chunk.documentId}의 ${chunk.pageNumber}페이지 내용을 바탕으로 한 모의 생성 근거입니다.`,
      priority: "MEDIUM",
      evidenceChunkIds: [chunk.chunkId],
      followUps: [],
      dataGaps: [],
    });
  }
  return questions;
}

interface QueuedJob {
  id: string;
  organizationId: string;
  projectId: string;
  createdBy: string;
  input: { documentIds: string[]; categories: string[]; questionCount: number; depth: string };
}

interface ProjectInfo {
  targetMarket: string;
  industry: string;
}

async function fetchProjectInfo(client: pg.Client, projectId: string): Promise<ProjectInfo> {
  const result = await client.query<{ target_market: string; industry: string }>(
    "select target_market, industry from projects where id = $1",
    [projectId]
  );
  if (result.rows.length === 0) {
    throw new Error(`project not found: ${projectId}`);
  }
  return { targetMarket: result.rows[0]!.target_market, industry: result.rows[0]!.industry };
}

async function fetchQueuedJobs(client: pg.Client): Promise<QueuedJob[]> {
  const result = await client.query<{
    id: string;
    organization_id: string;
    project_id: string;
    created_by: string;
    input: QueuedJob["input"];
  }>(
    `select id, organization_id, project_id, created_by, input from jobs
     where type = 'QUESTION_GENERATE' and status = 'QUEUED'
     order by created_at`
  );
  return result.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    createdBy: row.created_by,
    input: row.input,
  }));
}

async function fetchChunks(
  client: pg.Client,
  documentIds: string[]
): Promise<RetrievedChunkForPrompt[]> {
  if (documentIds.length === 0) {
    return [];
  }
  const result = await client.query<{
    id: string;
    document_id: string;
    page_number: number;
    content: string;
  }>(
    `select c.id, c.document_id, p.page_number, c.content
     from document_chunks c
     join document_pages p on p.id = c.page_id
     where c.document_id = any($1::uuid[])
     order by c.document_id, c.chunk_index
     limit $2`,
    [documentIds, MAX_CHUNKS_PER_JOB]
  );
  return result.rows.map((row) => ({
    chunkId: row.id,
    documentId: row.document_id,
    pageNumber: row.page_number,
    content: row.content,
  }));
}

async function insertQuestions(
  client: pg.Client,
  job: QueuedJob,
  questions: GeneratedQuestion[]
): Promise<void> {
  for (const q of questions) {
    await client.query(
      `insert into questions
         (organization_id, project_id, category, question_text, rationale, priority,
          follow_up_questions, source_job_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        job.organizationId,
        job.projectId,
        q.category,
        q.question,
        q.rationale,
        q.priority,
        JSON.stringify(q.followUps),
        job.id,
        job.createdBy,
      ]
    );
  }
}

async function markJob(
  client: pg.Client,
  jobId: string,
  status: "SUCCEEDED" | "FAILED",
  errorMessage?: string
): Promise<void> {
  await client.query(
    `update jobs set status = $1, progress = 100, finished_at = now(),
     started_at = coalesce(started_at, now()), attempts = attempts + 1, error_message = $2
     where id = $3`,
    [status, errorMessage ?? null, jobId]
  );
}

async function main(): Promise<void> {
  loadDotenvDefaults();
  const useMock = process.argv.includes("--mock");
  const dsn = requireEnv("DATABASE_URL");
  const apiKey = useMock ? null : requireEnv("AI_API_KEY");
  const model = useMock ? null : requireEnv("AI_GENERATION_MODEL_SNAPSHOT");
  const client = new pg.Client({ connectionString: dsn });
  await client.connect();

  try {
    const jobs = await fetchQueuedJobs(client);
    if (jobs.length === 0) {
      console.log("No QUEUED QUESTION_GENERATE jobs found.");
      return;
    }

    for (const job of jobs) {
      console.log(`Processing job ${job.id} (project ${job.projectId})...`);
      try {
        const chunks = await fetchChunks(client, job.input.documentIds);
        let generated: GeneratedQuestion[];
        if (useMock) {
          generated = mockGenerateQuestions({
            categories: job.input.categories,
            questionCount: job.input.questionCount,
            chunks,
          });
        } else {
          const project = await fetchProjectInfo(client, job.projectId);
          generated = await generateQuestions({
            apiKey: apiKey!,
            model: model!,
            targetMarket: project.targetMarket,
            industry: project.industry,
            questionCount: job.input.questionCount,
            categories: job.input.categories,
            depth: job.input.depth,
            chunks,
          });
        }
        const validated = questionGenerationOutputSchema.parse({ questions: generated });
        await insertQuestions(client, job, validated.questions);
        await markJob(client, job.id, "SUCCEEDED");
        console.log(`  -> SUCCEEDED (${validated.questions.length} questions)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await markJob(client, job.id, "FAILED", message);
        console.log(`  -> FAILED: ${message}`);
      }
    }
  } finally {
    await client.end();
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
