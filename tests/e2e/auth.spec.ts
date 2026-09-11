import { test, expect } from "@playwright/test";
import { createTestUser } from "./support/test-user";
import { signUp } from "./support/flows";

test.describe("S02 회원가입", () => {
  test("계정 생성 → 조직 생성 → 보안 안내를 거쳐 프로젝트 목록으로 이동한다", async ({ page }) => {
    const user = createTestUser();

    await signUp(page, user);

    await expect(page.getByRole("heading", { name: "IPO 프로젝트" })).toBeVisible();
  });

  test("이용약관에 동의하지 않으면 다음 단계로 진행할 수 없다", async ({ page }) => {
    const user = createTestUser();

    await page.goto("/signup");
    await page.getByLabel("이름").fill(user.displayName);
    await page.getByLabel("업무 이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "다음" }).click();

    await expect(page.getByText("이용약관 및 개인정보처리방침에 동의해야 가입할 수 있습니다.")).toBeVisible();
    await expect(page.getByLabel("조직명")).toHaveCount(0);
  });
});

test.describe("S01 로그인", () => {
  test("가입된 계정으로 로그인하면 프로젝트 목록으로 이동한다", async ({ page }) => {
    const user = createTestUser();
    await signUp(page, user);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();

    await expect(page).toHaveURL(/\/projects$/);
  });

  test("잘못된 비밀번호는 입력 오류 상태를 보여준다", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("이메일").fill("nonexistent@ipo-proof-test.dev");
    await page.getByLabel("비밀번호").fill("wrong-password-000");
    await page.getByRole("button", { name: "로그인" }).click();

    await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않습니다.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("세션 만료(?expired=1) 안내 배너를 보여준다", async ({ page }) => {
    await page.goto("/login?expired=1");

    await expect(page.getByText("세션이 만료되었습니다. 다시 로그인해주세요.")).toBeVisible();
  });
});
