import { test, expect } from "@playwright/test";

test.describe("Admin API security", () => {
  test("rejects unauthenticated access to controls", async ({ request }) => {
    const res = await request.get("/api/admin/controls");
    expect(res.status()).toBe(401);
  });

  test("rejects unauthenticated access to stats", async ({ request }) => {
    const res = await request.get("/api/admin/stats");
    expect(res.status()).toBe(401);
  });
});
