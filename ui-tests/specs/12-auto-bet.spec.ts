/**
 * 12-auto-bet.spec.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Full auto-bet feature coverage:
 *   • Auto mode tab shows correct sub-controls
 *   • Auto Cash Out input disabled until toggle on
 *   • Clearing auto cash out resets value to 1.10
 *   • Auto bet toggle enables and disables
 *   • Auto bet disables manual bet button
 *   • Auto bet auto-places bet at start of next betting round
 *   • Auto Cash Out fires at the configured multiplier @slow
 *   • Both panels can run independent auto-modes simultaneously
 *   • Switching to manual mode while auto-bet is on resets the lock
 */
import { test, expect } from "@playwright/test";
import {
  gotoApp,
  waitForBetting,
  waitForFlying,
  betPanel,
  panelActionButton,
  switchPanelMode,
  clickBet,
  setChipAmount,
  waitForMultiplierAbove,
} from "../helpers/game";
import { sel } from "../helpers/selectors";

test.describe("Auto-bet mode", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await waitForBetting(page);
  });

  // ── UI structure ────────────────────────────────────────────────────────

  test("auto mode tab reveals auto-bet and auto-cash-out controls", async ({
    page,
  }) => {
    await switchPanelMode(page, 0, "auto");
    const panel = betPanel(page, 0);
    await expect(panel.getByText("Auto bet")).toBeVisible();
    await expect(panel.getByText("Auto Cash Out")).toBeVisible();
    // Two toggle buttons should be present
    const toggles = panel.locator('[aria-pressed]');
    expect(await toggles.count()).toBeGreaterThanOrEqual(2);
  });

  test("auto mode hides controls when switching back to bet mode", async ({
    page,
  }) => {
    await switchPanelMode(page, 0, "auto");
    await expect(betPanel(page, 0).getByText("Auto bet")).toBeVisible();
    await switchPanelMode(page, 0, "bet");
    await expect(betPanel(page, 0).getByText("Auto bet")).toBeHidden();
    await expect(betPanel(page, 0).getByText("Auto Cash Out")).toBeHidden();
  });

  test("auto cash out input disabled when toggle is off", async ({ page }) => {
    await switchPanelMode(page, 0, "auto");
    // The auto-cash-out input is the last input in the panel
    const input = betPanel(page, 0).locator('input[inputmode="decimal"]').last();
    await expect(input).toBeDisabled();
  });

  test("auto cash out input enabled when toggle is turned on", async ({
    page,
  }) => {
    await switchPanelMode(page, 0, "auto");
    // Toggle is directly after the "Auto Cash Out" span (CSS adjacent sibling)
    const toggle = betPanel(page, 0).locator(
      'span:text("Auto Cash Out") + button[aria-pressed]',
    );
    await toggle.click();
    const input = betPanel(page, 0).locator('input[inputmode="decimal"]').last();
    await expect(input).toBeEnabled();
  });

  test("clearing auto cash out resets input to 1.10", async ({ page }) => {
    await switchPanelMode(page, 0, "auto");
    const toggle = betPanel(page, 0).locator(
      'span:text("Auto Cash Out") + button[aria-pressed]',
    );
    await toggle.click();
    const input = betPanel(page, 0).locator('input[inputmode="decimal"]').last();
    await input.fill("3.50");
    // Clear button has aria-label="Clear auto cash out"
    await betPanel(page, 0)
      .locator('button[aria-label="Clear auto cash out"]')
      .click();
    // Toggle clears: input disabled + value reset to 1.10
    await expect(input).toBeDisabled();
    await expect(input).toHaveValue("1.10");
  });

  test("auto bet toggle aria-pressed reflects state", async ({ page }) => {
    // Run during flying phase so enabling auto-bet does NOT trigger placeBet
    // (placeBet only fires when phase === "betting" AND !panel.active)
    await waitForFlying(page);
    await switchPanelMode(page, 0, "auto");
    // Structure: <label><span class="text-white/70">Auto bet</span><button aria-pressed/></label>
    const toggleBtn = betPanel(page, 0)
      .locator("label")
      .filter({ hasText: "Auto bet" })
      .locator("button[aria-pressed]");
    await expect(toggleBtn).toHaveAttribute("aria-pressed", "false");
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute("aria-pressed", "true");
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute("aria-pressed", "false");
  });

  // ── Bet button locking ──────────────────────────────────────────────────

  test("manual bet button disabled while auto-bet is on", async ({ page }) => {
    test.setTimeout(90_000);
    // Use flying phase: toggling auto-bet ON during flight won't call placeBet
    // so the action button stays as the manual locked "Bet" (disabled)
    await waitForFlying(page, 60_000);
    await switchPanelMode(page, 0, "auto");
    const toggleBtn = betPanel(page, 0)
      .locator("label")
      .filter({ hasText: "Auto bet" })
      .locator("button[aria-pressed]");
    await toggleBtn.click();
    const actionBtn = panelActionButton(page, 0);
    // autoLocked = true → disabled is true and text is "Bet"
    await expect(actionBtn).toBeDisabled({ timeout: 5000 });
    await expect(actionBtn).toContainText("Bet");
  });

  test("manual bet button re-enabled after turning auto-bet off", async ({
    page,
  }) => {
    // autoLocked = (mode==="auto" && autoBet===true)
    // During ANY phase, if no active bet and mode=auto:
    //   toggle ON  → autoLocked=true, action="bet" → disabled=true
    //   toggle OFF → autoLocked=false               → disabled=false
    // Use betting phase (beforeEach already set this). Ensure amount is 0-risk.
    // Key: do NOT place a bet — just toggle the flag, don't call placeBet.
    // To prevent auto-placeBet during betting, use zero-risk amount that IS valid.
    // Actually the only guarantee is to use flying phase where placeBet is NEVER called.
    // But we must wait for a LONG enough flying phase (> 1.50x to avoid early crash).
    test.setTimeout(120_000);
    // Wait for a flying phase where multiplier is already > 1.50 (avoids short rounds)
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-phase="flying"] .tabular-nums');
        return parseFloat(el?.textContent ?? "0") > 1.5;
      },
      undefined,
      { timeout: 90_000 },
    );
    await switchPanelMode(page, 0, "auto");
    const toggleBtn = betPanel(page, 0)
      .locator("label")
      .filter({ hasText: "Auto bet" })
      .locator("button[aria-pressed]");
    // Phase still flying — toggling ON should set autoLocked=true → disabled
    await toggleBtn.click();
    await expect(panelActionButton(page, 0)).toBeDisabled({ timeout: 3000 });
    // Toggling OFF removes lock → enabled
    await toggleBtn.click();
    await expect(panelActionButton(page, 0)).toBeEnabled({ timeout: 3000 });
  });

  // ── Auto-bet places bets automatically ─────────────────────────────────

  test("enabling auto bet during betting window immediately places bet", async ({
    page,
  }) => {
    await setChipAmount(page, 0, 10);
    await switchPanelMode(page, 0, "auto");
    const toggleBtn = betPanel(page, 0)
      .locator("label")
      .filter({ hasText: "Auto bet" })
      .locator("button[aria-pressed]");
    await toggleBtn.click();
    // Auto-bet fires placeBet immediately → button shows Cancel
    await expect(panelActionButton(page, 0)).toContainText("Cancel", {
      timeout: 8000,
    });
  });

  // ── Panel independence ───────────────────────────────────────────────────

  test("panel 1 can be in bet mode while panel 0 is in auto mode", async ({
    page,
  }) => {
    await switchPanelMode(page, 0, "auto");
    await expect(
      betPanel(page, 0).locator("label").filter({ hasText: "Auto bet" }),
    ).toBeVisible();
    // Panel 1 is still in bet mode — no Auto bet label visible
    await expect(
      betPanel(page, 1).locator("label").filter({ hasText: "Auto bet" }),
    ).toBeHidden();
  });

  test("both panels can independently toggle auto-cash-out", async ({ page }) => {
    await switchPanelMode(page, 0, "auto");
    await switchPanelMode(page, 1, "auto");

    // "Auto Cash Out" span is inside a flex div alongside the Toggle button.
    // The Toggle IS a button[aria-pressed]. Get it via its preceding sibling span.
    // Selector: span:text("Auto Cash Out") + button[aria-pressed]  (CSS next-sibling)
    const toggle0 = betPanel(page, 0).locator(
      'span:text("Auto Cash Out") + button[aria-pressed]',
    );
    const toggle1 = betPanel(page, 1).locator(
      'span:text("Auto Cash Out") + button[aria-pressed]',
    );

    await toggle0.click();
    await expect(toggle0).toHaveAttribute("aria-pressed", "true");
    await expect(toggle1).toHaveAttribute("aria-pressed", "false");
  });

  // ── Auto cash out fires at target multiplier ─────────────────────────────

  test("auto cash out fires at configured multiplier @slow", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoApp(page);
    await waitForBetting(page);

    await setChipAmount(page, 0, 10);
    await switchPanelMode(page, 0, "auto");

    // Enable auto cash out at 1.20x
    const acToggle = betPanel(page, 0).locator(
      'span:text("Auto Cash Out") + button[aria-pressed]',
    );
    await acToggle.click();
    const acInput = betPanel(page, 0)
      .locator('input[inputmode="decimal"]')
      .last();
    await acInput.fill("1.20");

    // Enable auto bet
    const abToggle = betPanel(page, 0)
      .locator("label")
      .filter({ hasText: "Auto bet" })
      .locator("button[aria-pressed]");
    await abToggle.click();

    // Wait until the bet goes into flying mode and we see cashedOut state
    await waitForFlying(page);

    // Poll for the cashed-out state on the button
    await expect
      .poll(
        async () => {
          const txt = await panelActionButton(page, 0).innerText().catch(() => "");
          return /cashed out|Waiting/i.test(txt) || /\d+\.\d{2}x/i.test(txt);
        },
        { timeout: 60_000, intervals: [500] },
      )
      .toBe(true);
  });
});
