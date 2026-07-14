import { test, expect, Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@aviator.com";
const ADMIN_PASSWORD = "admin123";

async function loginAsAdmin(page: Page) {
  await page.goto("/admin");
  await page.getByTestId("admin-email").fill(ADMIN_EMAIL);
  await page.getByTestId("admin-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("admin-login-submit").click();
  await expect(page.getByTestId("admin-panel")).toBeVisible({ timeout: 20_000 });
  // Wait for the initial controls fetch to settle (refresh is disabled while loading).
  await expect(page.getByTestId("admin-refresh")).toBeEnabled({ timeout: 15_000 });
}

test.describe("Admin panel — every control", () => {
  test("login screen validates and rejects bad credentials", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByTestId("admin-login")).toBeVisible();
    await page.getByTestId("admin-email").fill(ADMIN_EMAIL);
    await page.getByTestId("admin-password").fill("wrongpass");
    await page.getByTestId("admin-login-submit").click();
    const error = page.getByTestId("admin-login-error");
    await expect(error).toBeVisible({ timeout: 10_000 });
    await expect(error).toContainText(/Invalid email or password|Too many attempts/i);
    // Should stay on the login screen (not authenticate).
    await expect(page.getByTestId("admin-login")).toBeVisible();
  });

  test("all sections render after login", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("heading", { name: "Game Controls" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Global Win Rate" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bet Limits" })).toBeVisible();
    // House Economics has been removed.
    await expect(page.getByTestId("house-economics")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "House Wins" })).toHaveCount(0);
  });

  test("win-rate selector switches modes and updates description", async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Players Win" }).click();
    await expect(page.getByText(/Players win almost every round/i)).toBeVisible();

    await page.getByRole("button", { name: "Fair" }).click();
    await expect(page.getByText(/Balanced/i)).toBeVisible();

    // A save round-trip should surface the "Saved" indicator.
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test("bet limit steppers change values", async ({ page }) => {
    await loginAsAdmin(page);
    const min = page.getByTestId("stepper-minbet-input");
    const max = page.getByTestId("stepper-maxbet-input");
    const minStart = Number(await min.inputValue());
    const maxStart = Number(await max.inputValue());

    await page.getByTestId("stepper-minbet-inc").click();
    await expect(min).toHaveValue(String(minStart + 10));

    await page.getByTestId("stepper-maxbet-inc").click();
    await expect(max).toHaveValue(String(maxStart + 500));
  });

  test("refresh reloads controls and logout returns to login", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByTestId("admin-refresh").click();
    await expect(page.getByTestId("admin-panel")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByTestId("admin-login")).toBeVisible({ timeout: 10_000 });
  });
});
