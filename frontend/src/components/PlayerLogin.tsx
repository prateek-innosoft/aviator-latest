import { useState } from "react";
import { useAuth } from "../lib/authContext";

/**
 * Rough, temporary login widget for testing the real multi-user wallet flow
 * (see backend/scripts/create-test-users.mjs for the 5 test accounts).
 * Deliberately minimal — no styling polish, just enough to log in/out.
 */
export function PlayerLogin() {
  const { session, profile, login, logout, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (session && profile) {
    return (
      <div data-testid="player-login-status" className="flex items-center gap-2 text-[12px] text-white/70">
        <span>{profile.email}</span>
        <button
          data-testid="player-logout"
          onClick={() => logout()}
          className="rounded bg-white/10 px-2 py-1 text-white/80 hover:bg-white/20"
        >
          Logout
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        data-testid="player-login-open"
        onClick={() => setOpen(true)}
        className="rounded bg-white/10 px-2 py-1 text-[12px] text-white/70 hover:bg-white/20"
      >
        Login
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const result = await login(email.trim().toLowerCase(), password);
    setBusy(false);
    if (!result.ok) {
      setErr(result.reason === "invalid_credentials" ? "Invalid email/password" : "Login failed");
      return;
    }
    setOpen(false);
  };

  return (
    <form data-testid="player-login-form" onSubmit={submit} className="flex items-center gap-1 text-[12px]">
      <input
        data-testid="player-login-email"
        type="email"
        placeholder="tester1@aviator.local"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-[150px] rounded bg-white/10 px-2 py-1 text-white placeholder-white/40 outline-none"
      />
      <input
        data-testid="player-login-password"
        type="password"
        placeholder="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-[90px] rounded bg-white/10 px-2 py-1 text-white placeholder-white/40 outline-none"
      />
      <button
        data-testid="player-login-submit"
        type="submit"
        disabled={busy || loading}
        className="rounded bg-emerald-600 px-2 py-1 text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? "…" : "Go"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-white/40 hover:text-white/70">
        ✕
      </button>
      {err && <span className="text-red-400">{err}</span>}
    </form>
  );
}
