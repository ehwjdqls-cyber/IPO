/**
 * Local dev-only job runner for ANSWER_GENERATE -- NOT used in CI or
 * production. Same gap as run-question-jobs-local.ts: no real queue
 * consumer wired locally, and Milestone 3's answer generation needs one
 * too. Drains every QUEUED ANSWER_GENERATE job once, then exits.
 *
 * Uses the real hybridSearch() (spec 23절) for retrieval -- dense search
 * needs a real query embedding, and existing document chunks were
 * embedded with a local hash-based mock embedder (no real semantic
 * vectors), so dense search is disabled here (denseTopK: 0) and only the
 * sparse (Postgres full-text) side runs regardless of --mock. That's
 * still genuine retrieval over the real extracted document text, not a
 * mock -- only the embedding-based half is skipped, and only because the
 * underlying chunk embeddings aren't real yet (a separate, not-yet-done
 * re-embedding step, out of scope for this script).
 *
 * Calls the real generateAnswer() (src/answer-generation.ts) by default --
 * an actual OpenAI request, actual cost, its own prose. mockGenerateAnswer()
 * remains as a free, deterministic fallback that builds claims/citations
 * directly from the (real) retrieved chunk content: pass --mock to use it
 * instead of the real API.
 *
 * Writes directly via the same superuser DATABASE_URL connection
 * migrate-cli.ts uses, same reasoning as run-question-jobs-local.ts.
 *
 * Usage: from packages/ai/, with the workspace installed:
 * `npx tsx scripts/run-answer-jobs-local.ts` (real API, needs AI_API_KEY)
 * `npx tsx scripts/run-answer-jobs-local.ts --mock` (free, deterministic)
 * Reads DATABASE_URL/AI_API_KEY/AI_GENERATION_MODEL_SNAPSHOT from
 * apps/web/.env.local automatically.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { parseEnvFile } from "./env-file";
import {
  ANSWER_GENERATION_PROMPT_ID,
  answerGenerationOutputSchema,
  generateAnswer,
  validateAnswerOutput,
  type AnswerGenerationOutput,
} from "../src/answer-generation";
import { hybridSearch, type RetrievalCandidate } from "../src/retrieval";

const ENV_LOCAL_PATH = path.resolve(import.meta.dirname, "../../../apps/web/.env.local");
const ZERO_EMBEDDING = new Array(1536).fill(0);

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

export function mockGenerateAnswer(
  questionText: string,
  chunks: RetrievalCandidate[],
  maxClaims: number
): AnswerGenerationOutput {
  if (chunks.length === 0) {
    return {
      answerMarkdown: "관련 근거를 찾지 못했습니다. 추가 자료가 필요합니다.",
      evidenceStatus: "NEEDS_EVIDENCE",
      claims: [],
      dataGaps: [questionText],
      conflicts: [],
      followUpQuestions: [],
    };
  }

  const selected = chunks.slice(0, maxClaims);
  const claims = selected.map((chunk) => {
    const quote = chunk.content.slice(0, Math.min(40, chunk.content.length)).trim();
    return {
      claimText: `[모의생성] 문서 ${chunk.documentId} ${chunk.pageNumber}페이지에 따르면 "${quote}"입니다.`,
      isFactual: true,
      evidenceStatus: "SUPPORTED" as const,
      citations: [
        { evidenceChunkId: chunk.chunkId, quoteText: quote, verdict: "SUPPORTS" as const },
      ],
    };
  });

  return {
    answerMarkdown: claims.map((c) => c.claimText).join("\n\n"),
    evidenceStatus: "SUPPORTED",
    claims,
    dataGaps: [],
    conflicts: [],
    followUpQuestions: [],
  };
}

interface QueuedAnswerJob {
  id: string;
  organizationId: string;
  projectId: string;
  createdBy: string;
  input: {
    questionId: string;
    documentIds: string[] | null;
    category: string;
    style: string;
    maxClaims: number;
  };
}

async function fetchQueuedJobs(client: pg.Client): Promise<QueuedAnswerJob[]> {
  const result = await client.query<{
    id: string;
    organization_id: string;
    project_id: string;
    created_by: string;
    input: QueuedAnswerJob["input"];
  }>(
    `select id, organization_id, project_id, created_by, input from jobs
     where type = 'ANSWER_GENERATE' and status = 'QUEUED'
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

async function fetchQuestionText(client: pg.Client, questionId: string): Promise<string> {
  const result = await client.query<{ question_text: string }>(
    "select question_text from questions where id = $1",
    [questionId]
  );
  if (result.rows.length === 0) {
    throw new Error(`question not found: ${questionId}`);
  }
  return result.rows[0]!.question_text;
}

async function nextAnswerVersion(client: pg.Client, questionId: string): Promise<number> {
  const result = await client.query<{ max: number | null }>(
    "select max(version) as max from answer_versions where question_id = $1",
    [questionId]
  );
  return (result.rows[0]?.max ?? 0) + 1;
}

async function insertAnswer(
  client: pg.Client,
  job: QueuedAnswerJob,
  validated: AnswerGenerationOutput,
  candidatesById: Map<string, RetrievalCandidate>,
  modelSnapshot: string
): Promise<string> {
  const version = await nextAnswerVersion(client, job.input.questionId);
  const answerVersion = await client.query<{ id: string }>(
    `insert into answer_versions
       (question_id, version, body_markdown, source, evidence_status, model_snapshot, prompt_version, created_by)
     values ($1, $2, $3, 'AI', $4, $5, $6, $7)
     returning id`,
    [
      job.input.questionId,
      version,
      validated.answerMarkdown,
      validated.evidenceStatus,
      modelSnapshot,
      ANSWER_GENERATION_PROMPT_ID,
      job.createdBy,
    ]
  );
  const answerVersionId = answerVersion.rows[0]!.id;

  for (const [index, claim] of validated.claims.entries()) {
    const claimRow = await client.query<{ id: string }>(
      `insert into claims (answer_version_id, claim_index, claim_text, is_factual, evidence_status)
       values ($1, $2, $3, $4, $5) returning id`,
      [answerVersionId, index, claim.claimText, claim.isFactual, claim.evidenceStatus]
    );
    const claimId = claimRow.rows[0]!.id;

    for (const citation of claim.citations) {
      const candidate = candidatesById.get(citation.evidenceChunkId);
      if (!candidate) continue; // already filtered by validateAnswerOutput, defensive only
      await client.query(
        `insert into citations
           (claim_id, chunk_id, quote_text, page_number, relevance_score, verdict)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          claimId,
          citation.evidenceChunkId,
          citation.quoteText,
          candidate.pageNumber,
          Math.min(1, Math.max(0, candidate.fusedScore)),
          citation.verdict,
        ]
      );
    }
  }

  return answerVersionId;
}

async function markJob(
  client: pg.Client,
  jobId: string,
  status: "SUCCEEDED" | "FAILED",
  result?: Record<string, unknown>,
  errorMessage?: string
): Promise<void> {
  await client.query(
    `update jobs set status = $1, progress = 100, finished_at = now(),
     started_at = coalesce(started_at, now()), attempts = attempts + 1,
     result = $2, error_message = $3
     where id = $4`,
    [status, result ? JSON.stringify(result) : null, errorMessage ?? null, jobId]
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
      console.log("No QUEUED ANSWER_GENERATE jobs found.");
      return;
    }

    for (const job of jobs) {
      console.log(`Processing job ${job.id} (question ${job.input.questionId})...`);
      try {
        const questionText = await fetchQuestionText(client, job.input.questionId);
        const candidates = await hybridSearch(client, {
          organizationId: job.organizationId,
          projectId: job.projectId,
          queryEmbedding: ZERO_EMBEDDING,
          queryText: questionText,
          documentIds: job.input.documentIds ?? undefined,
          denseTopK: 0, // no real query embedding available -- sparse (FTS) only
        });
        const candidatesById = new Map(candidates.map((c) => [c.chunkId, c]));

        let parsed: AnswerGenerationOutput;
        const modelSnapshot = useMock ? "mock-local" : model!;
        if (useMock) {
          const generated = mockGenerateAnswer(questionText, candidates, job.input.maxClaims);
          parsed = answerGenerationOutputSchema.parse(generated);
        } else {
          const generated = await generateAnswer({
            apiKey: apiKey!,
            model: model!,
            questionText,
            category: job.input.category,
            chunks: candidates.slice(0, job.input.maxClaims),
          });
          parsed = generated;
        }
        const validated = validateAnswerOutput(parsed, candidates);

        const answerVersionId = await insertAnswer(client, job, validated, candidatesById, modelSnapshot);
        await markJob(client, job.id, "SUCCEEDED", { answerVersionId });
        console.log(`  -> SUCCEEDED (answerVersionId ${answerVersionId}, ${validated.evidenceStatus})`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await markJob(client, job.id, "FAILED", undefined, message);
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
