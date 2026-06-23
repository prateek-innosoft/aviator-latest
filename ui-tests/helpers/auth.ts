import type { Page } from "@playwright/test";

export const CREDS = {
  admin:   { email: "admin@aviator.local",   password: "Admin@Aviator2026!",   role: "superadmin" },
  player1: { email: "player1@aviator.local", password: "Player1@2026!",        role: "user" },
  player2: { email: "player2@aviator.local", password: "Player2@2026!",        role: "user" },
  invalid: { email: "nobody@nowhere.com",    password: "wrongpassword",        role: null },
} as const;

/** Navigate to app and fill + submit the login form. */
export async function loginAs(
  page: Page,
  cred: { email: string; password: string },
) {
  // Clear stale Supabase session before each login
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('sb-') || k.startsWith('supabase')) localStorage.removeItem(k);
      }
      sessionStorage.clear();
    } catch {}
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Wait for login screen
  await page.locator('[data-testid="login-screen"]').waitFor({ state: "visible", timeout: 10_000 });

  await page.locator('[data-testid="login-email"]').fill(cred.email);
  await page.locator('[data-testid="login-password"]').fill(cred.password);
  await page.locator('[data-testid="login-submit"]').click();
}

/** Login and wait until the game canvas (regular user) or admin panel is visible. */
export async function loginAndWait(
  page: Page,
  cred: { email: string; password: string },
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await page.waitForTimeout(3000);
    await loginAs(page, cred);
    // Admin users land on admin panel; regular users land on the game with header+canvas
    const result = await page.waitForFunction(() => {
      const ok  = document.querySelector('[data-testid="header"]') ||
                  document.querySelector('[data-testid="admin-panel"]');
      const err = document.querySelector('[data-testid="login-error"]');
      return ok ? 'ok' : (err ? 'error' : null);
    }, { timeout: 15_000 }).catch(() => null);
    const outcome = await result?.jsonValue().catch(() => null);
    if (outcome === 'ok') return;
    // retry on error or timeout
  }
}

/** Click logout and wait for login screen to reappear. */
export async function logout(page: Page) {
  await page.locator('[data-testid="logout-btn"]').click();
  await page.locator('[data-testid="login-screen"]').waitFor({ state: "visible", timeout: 8_000 });
}
