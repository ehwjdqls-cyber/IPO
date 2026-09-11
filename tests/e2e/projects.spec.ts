import { test, expect } from "@playwright/test";
import { createTestUser } from "./support/test-user";
import { signUp } from "./support/flows";

test("S03→S04→S05: 빈 프로젝트 목록에서 새 프로젝트를 만들고 대시보드로 이동한다", async ({ page }) => {
  const user = createTestUser();
  await signUp(page, user);

  // S03: 빈 상태
  await expect(page.getByText("아직 프로젝트가 없습니다.")).toBeVisible();
  await page.getByRole("link", { name: "새 프로젝트 만들기" }).click();
  await expect(page).toHaveURL(/\/projects\/new$/);

  // S04: 1. 기본정보
  await page.getByLabel("프로젝트명").fill("예시테크 IPO 2027");
  await page.getByLabel("회사명").fill("주식회사 예시테크");
  await page.getByLabel("업종").fill("B2B SaaS");
  await page.getByRole("button", { name: "다음" }).click();

  // S04: 2. 상장계획
  await page.getByLabel("목표시장").selectOption("KOSDAQ");
  await page.getByRole("button", { name: "다음" }).click();

  // S04: 3. 분석범위 (기본값 그대로)
  await page.getByRole("button", { name: "다음" }).click();

  // S04: 4. 확인
  await page.getByRole("button", { name: "프로젝트 생성" }).click();

  // S05: 프로젝트 대시보드
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "주식회사 예시테크" })).toBeVisible();
  await expect(page.getByText("KOSDAQ", { exact: false })).toBeVisible();

  // S03: 새로 만든 프로젝트가 목록에 보인다
  await page.goto("/projects");
  await expect(page.getByRole("link", { name: "주식회사 예시테크" })).toBeVisible();
});

test("S04: 필수값이 없으면 다음 단계로 진행할 수 없다", async ({ page }) => {
  const user = createTestUser();
  await signUp(page, user);

  await page.getByRole("link", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByRole("button", { name: "다음" })).toBeDisabled();

  await page.getByLabel("프로젝트명").fill("예시테크 IPO 2027");
  await expect(page.getByRole("button", { name: "다음" })).toBeDisabled();

  await page.getByLabel("회사명").fill("주식회사 예시테크");
  await page.getByLabel("업종").fill("B2B SaaS");
  await expect(page.getByRole("button", { name: "다음" })).toBeEnabled();
});
