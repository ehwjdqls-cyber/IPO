import { expect, type Page } from "@playwright/test";
import type { TestUser } from "./test-user";

/** Drives the full S02 wizard (account -> organization -> security) and
 * lands on S03 (/projects), matching US-01's acceptance criteria. */
export async function signUp(page: Page, user: TestUser): Promise<void> {
  await page.goto("/signup");

  await page.getByLabel("이름").fill(user.displayName);
  await page.getByLabel("업무 이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByLabel(/이용약관/).check();
  await page.getByRole("button", { name: "다음" }).click();

  await page.getByLabel("조직명").fill(user.orgName);
  await page.getByRole("button", { name: "조직 생성" }).click();

  await expect(page.getByText(/MFA\(다단계 인증\) 설정은 추후 제공됩니다\./)).toBeVisible();
  await page.getByRole("button", { name: "시작하기" }).click();

  await expect(page).toHaveURL(/\/projects$/);
}
