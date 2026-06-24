import { io } from "socket.io-client";

const API = "http://localhost:4000";
const ts = Date.now();
const email = `canceltest_${ts}@test.com`;
const password = "Test@12345678";

// 1. Create user
let r = await fetch(`${API}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@aviator.local", password: "Admin@Aviator2026!" }),
});
const { access_token: adminToken } = await r.json();
console.log("Admin token:", adminToken ? "OK" : "FAIL");

r = await fetch(`${API}/api/admin/users`, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ email, password, role: "user", balance: 5000 }),
});
const created = await r.json();
console.log("User created:", created.ok, "id:", created.user_id);

// 2. Login as the user
r = await fetch(`${API}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const { access_token: userToken, user } = await r.json();
console.log("User login:", user?.email, "balance:", user?.balance, "id:", user?.id);

const userId = user?.id;

// 3. Connect socket
const socket = io(API, { transports: ["websocket"] });

await new Promise((resolve) => socket.on("connect", resolve));
console.log("Socket connected:", socket.id);

// 4. Identify authenticated user
socket.emit("auth:identify", { userId, token: userToken });
await new Promise(r => setTimeout(r, 500));

// 5. Wait for init + betting phase
const initData = await new Promise((resolve) => {
  socket.on("init", (data) => resolve(data));
  socket.on("round:betting", (data) => resolve({ state: data }));
});
console.log("Game phase:", initData?.state?.phase ?? initData?.balance);

// Wait for betting phase with enough countdown
let roundId = null;
let phaseData = null;
await new Promise((resolve) => {
  const check = (data) => {
    phaseData = data;
    const cd = data?.countdown ?? data?.state?.countdown ?? 0;
    const phase = data?.phase ?? data?.state?.phase ?? "unknown";
    console.log(`Phase: ${phase}  countdown: ${cd}`);
    if (phase === "betting" && cd > 3000) {
      socket.off("round:betting", check);
      socket.off("init", check);
      resolve();
    }
  };
  socket.on("round:betting", check);
  socket.on("init", check);
  // Also check current init data
  if (initData?.balance !== undefined) {
    const cd = initData?.state?.countdown ?? 0;
    if (initData?.state?.phase === "betting" && cd > 3000) resolve();
  }
});

// Get supabaseRoundId from state endpoint
r = await fetch(`${API}/api/state`);
const state = await r.json();
console.log("Round state - phase:", state.phase, "supabaseRoundId:", state.supabaseRoundId);

// 6. Place a bet
console.log("\n--- Placing bet ---");
socket.emit("bet:place", { panel: 0, amount: 2, userId });

const accepted = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("bet:accepted timeout")), 5000);
  socket.on("bet:accepted", (d) => { clearTimeout(timer); resolve(d); });
  socket.on("bet:rejected", (d) => { clearTimeout(timer); reject(new Error(`bet:rejected: ${JSON.stringify(d)}`)); });
});
console.log("bet:accepted:", JSON.stringify(accepted));

// 7. Cancel the bet
console.log("\n--- Cancelling bet ---");
socket.emit("bet:cancelWithAmount", { panel: 0, amount: 2, userId });

const cancelled = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("bet:cancelled timeout - no response in 5s")), 5000);
  socket.on("bet:cancelled", (d) => { clearTimeout(timer); resolve(d); });
  socket.on("bet:cancel_failed", (d) => { clearTimeout(timer); reject(new Error(`bet:cancel_failed: ${JSON.stringify(d)}`)); });
});
console.log("bet:cancelled:", JSON.stringify(cancelled));

// 8. Verify balance increased
r = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${userToken}` } });
const me = await r.json();
console.log("\nFinal DB balance:", me.user?.balance);

socket.disconnect();

// Cleanup
r = await fetch(`${API}/api/admin/users/${created.user_id}`, {
  method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` },
});
console.log("Cleanup:", r.status);
