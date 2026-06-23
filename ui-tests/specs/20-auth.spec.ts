import { test, expect } from "@playwright/test";
import { CREDS, loginAs, loginAndWait, logout } from "../helpers/auth";

// ── 1. Login screen renders ─────────────────────────────────────────────────
test("login screen renders when unauthenticated", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const screen = page.locator('[data-testid="login-screen"]');
  await screen.waitFor({ state: "visible", timeout: 10_000 });

  await expect(page.locator('[data-testid="login-email"]')).toBeVisible();
  await expect(page.locator('[data-testid="login-password"]')).toBeVisible();
  await expect(page.locator('[data-testid="login-submit"]')).toBeVisible();
});

// ── 2. Submit button disabled with empty fields ─────────────────────────────
test("submit button disabled with empty fields", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="login-screen"]').waitFor({ state: "visible" });
  await expect(page.locator('[data-testid="login-submit"]')).toBeDisabled();
});

// ── 3. Invalid credentials shows error ─────────────────────────────────────
test("invalid credentials shows error message", async ({ page }) => {
  await loginAs(page, CREDS.invalid);
  const err = page.locator('[data-testid="login-error"]');
  await err.waitFor({ state: "visible", timeout: 10_000 });
  await expect(err).toContainText(/invalid|password|credentials/i);
  // Must still be on login screen
  await expect(page.locator('[data-testid="login-screen"]')).toBeVisible();
});

// ── 4. Valid login navigates to game ────────────────────────────────────────
test("valid login navigates to game canvas", async ({ page }) => {
  await loginAndWait(page, CREDS.player1);
  await expect(page.locator('[data-testid="header"]')).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  // Login screen must be gone
  await expect(page.locator('[data-testid="login-screen"]')).not.toBeVisible();
});

// ── 5. Header shows username after login ────────────────────────────────────
test("header shows player username after login", async ({ page }) => {
  await loginAndWait(page, CREDS.player1);
  const header = page.locator('[data-testid="header"]');
  // display_name or username should appear somewhere in the header area
  await expect(header).toContainText(/player1|Player One/i);
});

// ── 6. Admin user lands on admin panel (not the game) ──────────────────────
test("admin role badge shown for admin login", async ({ page }) => {
  await loginAndWait(page, CREDS.admin);
  // Admin users see the admin panel, not the regular game UI
  const adminPanel = page.locator('[data-testid="admin-panel"]');
  await expect(adminPanel).toBeVisible({ timeout: 5000 });
});

// ── 7. Logout returns to login screen ───────────────────────────────────────
test("logout returns to login screen", async ({ page }) => {
  await loginAndWait(page, CREDS.player1);
  await logout(page);
  await expect(page.locator('[data-testid="login-screen"]')).toBeVisible();
});

// ── 8. Session persists across reload ───────────────────────────────────────
test("session persists after page reload", async ({ page }) => {
  await loginAndWait(page, CREDS.player1);
  await page.reload({ waitUntil: "domcontentloaded" });
  // Should go straight to game (session restored from storage)
  await page.locator('[data-testid="header"]').waitFor({ state: "visible", timeout: 15_000 });
  await expect(page.locator('[data-testid="login-screen"]')).not.toBeVisible();
});

// ── 9. Balance displayed in header after login ──────────────────────────────
test("balance is shown in header after login", async ({ page }) => {
  await loginAndWait(page, CREDS.player1);
  const header = page.locator('[data-testid="header"]');
  // Should show a number followed by ZAR
  await expect(header).toContainText(/ZAR/i);
});

// ── 10. Two concurrent users have independent sessions ──────────────────────
test("two concurrent users have independent sessions", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await loginAndWait(page1, CREDS.player1);
  await loginAndWait(page2, CREDS.player2);

  await expect(page1.locator('[data-testid="header"]')).toContainText(/player1|Player One/i);
  await expect(page2.locator('[data-testid="header"]')).toContainText(/player2|Player Two/i);

  await ctx1.close();
  await ctx2.close();
});

// ── 11. API: /api/auth/login returns 401 for bad creds ──────────────────────
test("API login returns 401 for bad credentials", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { email: "nobody@nowhere.com", password: "badpass" },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(body.reason).toBe("invalid_credentials");
});

// ── 12. API: /api/auth/login returns 400 for invalid email format ───────────
test("API login returns 400 for malformed email", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { email: "not-an-email", password: "somepass" },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.ok).toBe(false);
});

// ── 13. API: /api/auth/me requires auth ─────────────────────────────────────
test("GET /api/auth/me returns 401 without token", async ({ request }) => {
  const res = await request.get("/api/auth/me");
  expect(res.status()).toBe(401);
});

// ── 14. API: /api/admin/users requires admin role ───────────────────────────
test("GET /api/admin/users returns 401 without token", async ({ request }) => {
  const res = await request.get("/api/admin/users");
  expect(res.status()).toBe(401);
});

// ── 15. API: admin can create a new user ────────────────────────────────────
test("admin can create a new user via API", async ({ request }) => {
  // First login as admin to get token
  const loginRes = await request.post("/api/auth/login", {
    data: { email: CREDS.admin.email, password: CREDS.admin.password },
  });
  const { access_token } = await loginRes.json();

  const ts = Date.now();
  const res = await request.post("/api/admin/users", {
    headers: { Authorization: `Bearer ${access_token}` },
    data: {
      email:        `testuser_${ts}@aviator.local`,
      password:     "TestUser@2026!",
      username:     `testuser${ts}`,
      display_name: "Test User",
      role:         "user",
      balance:      25000,
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.email).toContain("testuser_");
});

// ── 16. API: duplicate email rejected ──────────────────────────────────────
test("admin create user rejects duplicate email", async ({ request }) => {
  const loginRes = await request.post("/api/auth/login", {
    data: { email: CREDS.admin.email, password: CREDS.admin.password },
  });
  const { access_token } = await loginRes.json();

  const res = await request.post("/api/admin/users", {
    headers: { Authorization: `Bearer ${access_token}` },
    data: {
      email:    CREDS.player1.email,
      password: "SomePass@2026!",
    },
  });
  expect(res.status()).toBe(409);
  const body = await res.json();
  expect(body.ok).toBe(false);
});
