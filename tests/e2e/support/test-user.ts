import { randomUUID } from "node:crypto";

export interface TestUser {
  email: string;
  password: string;
  displayName: string;
  orgName: string;
}

/**
 * Every test that signs up needs a fresh email -- Supabase Auth rejects a
 * duplicate signup, and these specs run against a real (test) Supabase
 * project rather than a resettable local DB.
 */
export function createTestUser(): TestUser {
  const id = randomUUID().slice(0, 8);
  return {
    email: `e2e-${id}@ipo-proof-test.dev`,
    password: `Passw0rd!${id}`,
    displayName: `E2E 테스터 ${id}`,
    orgName: `E2E 조직 ${id}`,
  };
}
