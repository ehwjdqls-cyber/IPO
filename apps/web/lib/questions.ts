import "server-only";
import type { PriorityLevel, QuestionCategory } from "@ipo/contracts";

export interface QuestionRow {
  id: string;
  organization_id: string;
  project_id: string;
  category: QuestionCategory;
  question_text: string;
  rationale: string;
  priority: PriorityLevel;
  follow_up_questions: string[];
  source_job_id: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface QuestionDto {
  id: string;
  organizationId: string;
  projectId: string;
  category: QuestionCategory;
  questionText: string;
  rationale: string;
  priority: PriorityLevel;
  followUpQuestions: string[];
  sourceJobId: string | null;
  assignedTo: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function toQuestionDto(row: QuestionRow): QuestionDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    category: row.category,
    questionText: row.question_text,
    rationale: row.rationale,
    priority: row.priority,
    followUpQuestions: row.follow_up_questions,
    sourceJobId: row.source_job_id,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const QUESTION_COLUMNS =
  "id, organization_id, project_id, category, question_text, rationale, priority, follow_up_questions, source_job_id, assigned_to, created_by, created_at, updated_at";
