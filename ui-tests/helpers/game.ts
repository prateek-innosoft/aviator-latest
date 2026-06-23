import type { Page, Locator } from "@playwright/test";
import { sel, type GamePhase } from "./selectors";

// Default test credentials used by existing game specs.
const TEST_EMAIL    = "player1@aviator.local";
const TEST_PASSWORD = "Player1@2026!";

/** Auto-login if login screen is shown, then wait for header + canvas. Retries on auth errors. */
async function ensureLoggedIn(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await page.waitForTimeout(3000);

    const loginScreen = page.locator('[data-testid="login-screen"]');
    const isLogin = await loginScreen.isVisible().catch(() => false);
    if (isLogin) {
      await page.locator('[data-testid="login-email"]').fill(TEST_EMAIL);
      await page.locator('[data-testid="login-password"]').fill(TEST_PASSWORD);
      await page.locator('[data-testid="login-submit"]').click();
    }

    // Wait for success OR an auth error we can retry
    const result = await page.waitForFunction(() => {
      const ok  = document.querySelector('[data-testid="header"]');
      const err = document.querySelector('[data-testid="login-error"]');
      return ok ? 'ok' : (err ? 'error' : null);
    }, { timeout: 15_000 }).catch(() => null);
    const outcome = await result?.jsonValue().catch(() => null);
    if (outcome === 'ok') break;
    // On error, clear storage and retry
    await page.evaluate(() => {
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('sb-') || k.startsWith('supabase')) localStorage.removeItem(k);
        }
      } catch {}
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  }
  await page.locator(sel.header).waitFor({ state: "visible", timeout: 15_000 });
  await page.locator(sel.gameCanvas).first().waitFor({ state: "visible", timeout: 10_000 });
}

// ─── Navigation ────────────────────────────────────────────────────────────

export async function gotoApp(page: Page) {
  // Clear stale Supabase session before navigating so login screen always appears
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
  await ensureLoggedIn(page);
}

/** Reload app and wait for it to be fully ready. */
export async function reloadApp(page: Page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await ensureLoggedIn(page);
}

export async function waitForPhase(
  page: Page,
  phase: GamePhase,
  timeout = 60_000,
) {
  await page
    .locator(`[data-phase="${phase}"]`)
    .first()
    .waitFor({ state: "visible", timeout });
}

export async function waitForBetting(page: Page, timeout = 65_000) {
  await waitForPhase(page, "betting", timeout);
  await page.waitForTimeout(300);
}

export async function waitForFlying(page: Page, timeout = 30_000) {
  await waitForPhase(page, "flying", timeout);
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-phase="flying"]');
      const mult = el?.querySelector(".tabular-nums");
      const v = parseFloat(mult?.textContent ?? "0");
      return v >= 1.1;
    },
    { timeout },
  );
}

export async function waitForCrashed(page: Page, timeout = 120_000) {
  await waitForPhase(page, "crashed", timeout);
  await page.getByText("Flew Away!").first().waitFor({ state: "visible", timeout: 5000 });
}

export function betPanel(page: Page, index: 0 | 1): Locator {
  return page.locator(sel.betPanel(index));
}

export function panelActionButton(page: Page, index: 0 | 1): Locator {
  return betPanel(page, index).locator(".grid > button.rounded-xl").first();
}

export async function clickBet(page: Page, index: 0 | 1 = 0) {
  const btn = panelActionButton(page, index);
  await btn.waitFor({ state: "visible" });
  await btn.click();
}

export async function setChipAmount(page: Page, index: 0 | 1, amount: number) {
  await betPanel(page, index).getByRole("button", { name: String(amount), exact: true }).click();
}

export function panelModeTab(page: Page, index: 0 | 1, mode: "bet" | "auto") {
  return betPanel(page, index)
    .locator(".rounded-full.bg-\\[\\#101113\\]")
    .getByRole("button", { name: mode });
}

export async function switchPanelMode(page: Page, index: 0 | 1, mode: "bet" | "auto") {
  await panelModeTab(page, index, mode).click();
}

export async function getCurrentPhase(page: Page): Promise<GamePhase> {
  return page.locator(sel.gameCanvas).first().getAttribute("data-phase") as Promise<GamePhase>;
}

export async function getBalanceText(page: Page): Promise<string> {
  return page.locator(`${sel.header} .text-balance`).innerText();
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 2;
  });
  return overflow;
}

// ─── Balance helpers ────────────────────────────────────────────────────────

export async function getBalanceValue(page: Page): Promise<number> {
  const text = await page.locator(sel.balance).innerText();
  return parseFloat(text.replace(/[^0-9.]/g, ""));
}

// ─── Console error capturing ────────────────────────────────────────────────

export function attachConsoleErrorCapture(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return () => errors;
}

// ─── Canvas helpers ─────────────────────────────────────────────────────────

/** Sample a pixel colour [r,g,b,a] at (x,y) from the first canvas element. */
export async function sampleCanvasPixel(
  page: Page,
  x: number,
  y: number,
): Promise<[number, number, number, number]> {
  return page.evaluate(
    ([px, py]) => {
      const canvas = document.querySelector(
        "[data-phase] canvas",
      ) as HTMLCanvasElement | null;
      if (!canvas) return [0, 0, 0, 0];
      const ctx = canvas.getContext("2d");
      if (!ctx) return [0, 0, 0, 0];
      const d = ctx.getImageData(px, py, 1, 1).data;
      return [d[0], d[1], d[2], d[3]] as [number, number, number, number];
    },
    [x, y] as [number, number],
  );
}

/** Returns true if the canvas has any non-black pixels (i.e. is drawing). */
export async function canvasIsDrawing(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.querySelector(
      "[data-phase] canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return false;
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 20) return true;
    }
    return false;
  });
}

/** Get canvas logical dimensions. */
export async function getCanvasDimensions(
  page: Page,
): Promise<{ w: number; h: number; cssW: number; cssH: number }> {
  return page.evaluate(() => {
    const c = document.querySelector(
      "[data-phase] canvas",
    ) as HTMLCanvasElement | null;
    if (!c) return { w: 0, h: 0, cssW: 0, cssH: 0 };
    return {
      w: c.width,
      h: c.height,
      cssW: c.offsetWidth,
      cssH: c.offsetHeight,
    };
  });
}

// ─── Animation helpers ──────────────────────────────────────────────────────

/**
 * Poll whether a GSAP-animated element is mid-tween by comparing its transform
 * at two successive rAF ticks. Returns true if the transform changed.
 */
export async function elementIsAnimating(
  page: Page,
  selector: string,
  samplesMs = 200,
): Promise<boolean> {
  const before = await page.locator(selector).evaluate((el) => {
    return (el as HTMLElement).style.transform;
  });
  await page.waitForTimeout(samplesMs);
  const after = await page.locator(selector).evaluate((el) => {
    return (el as HTMLElement).style.transform;
  });
  return before !== after;
}

/**
 * Measure how many distinct transform values the plane element takes during
 * `durationMs`. A value > 1 confirms the plane is being repositioned.
 */
export async function countPlanePositionChanges(
  page: Page,
  durationMs = 500,
): Promise<number> {
  return page.evaluate((ms) => {
    return new Promise<number>((resolve) => {
      const plane = document.querySelector(
        ".pointer-events-none.absolute.left-0.top-0.z-20",
      ) as HTMLElement | null;
      if (!plane) { resolve(0); return; }
      const seen = new Set<string>();
      const poll = () => seen.add(plane.style.transform);
      const id = setInterval(poll, 16);
      setTimeout(() => { clearInterval(id); resolve(seen.size); }, ms);
    });
  }, durationMs);
}

/**
 * Capture whether the sunburst rays element has a non-zero rotation (set by GSAP).
 */
export async function getRaysRotation(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector(
      "[class*='pointer-events-none'][class*='absolute'][class*='transition-opacity']",
    ) as HTMLElement | null;
    if (!el) return 0;
    const t = el.style.transform;
    const m = t.match(/rotate\(([\d.]+)deg\)/);
    return m ? parseFloat(m[1]) : 0;
  });
}

// ─── WebSocket event capture ────────────────────────────────────────────────

/** Subscribe to a named socket.io event emitted from the page context.
 *  Returns an accessor that returns collected payloads so far. */
export function captureSocketEvents(
  page: Page,
  ...events: string[]
): () => Promise<Array<{ event: string; data: unknown }>> {
  const captured: Array<{ event: string; data: unknown }> = [];

  page.on("websocket", (ws) => {
    ws.on("framereceived", (frame) => {
      try {
        const raw = frame.payload.toString();
        if (!raw.startsWith("42")) return;
        const json = JSON.parse(raw.slice(2));
        if (Array.isArray(json) && events.includes(json[0])) {
          captured.push({ event: json[0], data: json[1] });
        }
      } catch { /* non-JSON frame — ignore */ }
    });
  });

  return async () => [...captured];
}

// ─── Multiplier monitoring ───────────────────────────────────────────────────

/** Poll the live multiplier from the DOM (not from the store). */
export async function getLiveMultiplier(page: Page): Promise<number> {
  const text = await page
    .locator('[data-phase="flying"] .tabular-nums')
    .first()
    .innerText()
    .catch(() => "0x");
  return parseFloat(text.replace("x", "")) || 0;
}

/** Wait until the multiplier exceeds `target` (useful in flying phase). */
export async function waitForMultiplierAbove(
  page: Page,
  target: number,
  timeout = 30_000,
): Promise<void> {
  await page.waitForFunction(
    (t) => {
      const el = document.querySelector('[data-phase="flying"] .tabular-nums');
      return parseFloat(el?.textContent ?? "0") > t;
    },
    target,
    { timeout },
  );
}

// ─── Toast helpers ───────────────────────────────────────────────────────────

/** Wait for the win-toast to appear and return its text content. */
export async function waitForWinToast(
  page: Page,
  timeout = 10_000,
): Promise<string> {
  const toast = page.locator(".absolute.left-1\\/2.top-3");
  await toast.waitFor({ state: "visible", timeout });
  return toast.innerText();
}

// ─── Network helpers ─────────────────────────────────────────────────────────

/** Confirm the backend REST health endpoint is reachable. */
export async function fetchApiHealth(
  page: Page,
): Promise<{ status: string; phase: string }> {
  return page.evaluate(async () => {
    const r = await fetch("http://localhost:4000/api/health");
    return r.json();
  });
}

/** Fetch public game state from the backend REST endpoint. */
export async function fetchApiState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const r = await fetch("http://localhost:4000/api/state");
    return r.json();
  });
}
