import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@aviator.com";
const ADMIN_PASSWORD = "admin123";

test.describe("Admin panel", () => {
  test("shows login at /admin when unauthenticated", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByTestId("admin-login")).toBeVisible();
    await expect(page.getByTestId("admin-email")).toBeVisible();
  });

  test("admin login shows game controls", async ({ page }) => {
    await page.goto("/admin");
    await page.getByTestId("admin-email").fill(ADMIN_EMAIL);
    await page.getByTestId("admin-password").fill(ADMIN_PASSWORD);
    await page.getByTestId("admin-login-submit").click();

    await expect(page.getByTestId("admin-panel")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Game Controls" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Global Win Rate" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bet Limits" })).toBeVisible();
  });

  test("win mode buttons are interactive", async ({ page }) => {
    await page.goto("/admin");
    await page.getByTestId("admin-email").fill(ADMIN_EMAIL);
    await page.getByTestId("admin-password").fill(ADMIN_PASSWORD);
    await page.getByTestId("admin-login-submit").click();
    await expect(page.getByTestId("admin-panel")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Fair" }).click();
    await page.getByRole("button", { name: "Players Win" }).click();

    // Saved indicator may flash
    await page.waitForTimeout(1500);
  });
});
