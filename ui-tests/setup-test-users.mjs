const API = "http://localhost:4000";

async function req(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const login = await req("POST", "/api/auth/login", {
  email: "admin@aviator.local",
  password: "Admin@Aviator2026!",
});
if (!login.ok) { console.error("Admin login failed:", login); process.exit(1); }
const token = login.access_token;
console.log("✅ Admin token acquired");

const users = [
  { email: "player1@aviator.local", password: "Player1@2026!", username: "player1", display_name: "Player One",  role: "user", balance: 50000 },
  { email: "player2@aviator.local", password: "Player2@2026!", username: "player2", display_name: "Player Two",  role: "user", balance: 50000 },
];

for (const u of users) {
  const r = await req("POST", "/api/admin/users", u, token);
  if (r.ok) {
    console.log(`✅ Created ${u.email}  id=${r.user_id}`);
  } else if (r.reason === "email_taken" || r.reason === "username_taken" || r.reason === "duplicate") {
    console.log(`ℹ️  ${u.email} already exists — skipping`);
  } else {
    console.error(`❌ Failed to create ${u.email}:`, r);
  }
}
console.log("Done.");
