/** Minimal .env parser -- mirrors workers/document-worker/env_file.py so
 * run-question-jobs-local.ts can auto-load apps/web/.env.local the same
 * way the Python runner does, without a dotenv dependency. Dev-only
 * tooling, not used by production/CI code. */
import { existsSync, readFileSync } from "node:fs";

export function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }
  const result: Record<string, string> = {};
  const lines = readFileSync(path, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    result[key] = value;
  }
  return result;
}
