import { test, expect } from "@playwright/test";

test.describe("Game — demo mode", () => {
  test("loads main UI and connects to backend", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("header")).toBeVisible();
    await expect(page.getByTestId("bet-panels")).toBeVisible();
    await expect(page.getByTestId("history-bar")).toBeVisible();
    await expect(page.getByTestId("balance-display")).toBeVisible({ timeout: 30_000 });
  });

  test("can place a demo bet during betting phase", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("balance-display")).toBeVisible({ timeout: 30_000 });

    const betBtn = page.getByTestId("bet-action-0");
    await expect(betBtn).toBeVisible();

    // Wait for betting window (button shows Bet + amount, not Waiting)
    await expect(betBtn).toContainText(/Bet/i, { timeout: 45_000 });
    await betBtn.click();

    // After bet: Cancel or Cash Out appears
    await expect(betBtn).toContainText(/Cancel|Cash Out|Waiting/i, { timeout: 15_000 });
  });

  test("history bar shows crash multipliers over time", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("history-bar")).toBeVisible();
    // Wait for at least one round to complete
    await page.waitForTimeout(12_000);
    const pills = page.locator('[data-testid="history-bar"] button, [data-testid="history-bar"] span');
    await expect(pills.first()).toBeVisible();
  });
});
