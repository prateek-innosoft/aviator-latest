import { useState, useRef, useEffect, type FormEvent } from "react";
import { useAuth } from "../lib/authContext";

export function LoginScreen() {
  const { login, loading, error, clearError } = useAuth();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    await login(email.trim().toLowerCase(), password);
    setSubmitting(false);
  }

  const busy = loading || submitting;

  return (
    <div
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0d0e10]"
      data-testid="login-screen"
    >
      {/* Animated background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-[#e8173a]/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-[#e8173a]/8 blur-[140px]" />
        <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff4d6d]/5 blur-[100px]" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-[420px] px-4">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#e8173a] to-[#ff6b35] shadow-[0_0_40px_rgba(232,23,58,0.4)]">
            <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white" aria-hidden="true">
              <path d="M21 3L3 10.5l7 2.5 2.5 7L21 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">AVIATOR</h1>
          <p className="mt-1 text-sm text-white/40">Enterprise Gaming Platform</p>
        </div>

        {/* Form card */}
        <div className="rounded-3xl border border-white/8 bg-[#16181b]/80 p-8 shadow-2xl backdrop-blur-xl">
          <h2 className="mb-6 text-xl font-bold text-white">Sign in to your account</h2>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-medium text-white/60">
                Email address
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M2 7l10 7 10-7" />
                  </svg>
                </span>
                <input
                  id="login-email"
                  ref={emailRef}
                  type="email"
                  autoComplete="email"
                  required
                  disabled={busy}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                  placeholder="you@example.com"
                  data-testid="login-email"
                  className="w-full rounded-xl border border-white/10 bg-[#1e2024] py-3 pl-10 pr-4 text-sm text-white placeholder-white/25 outline-none transition focus:border-[#e8173a]/60 focus:ring-1 focus:ring-[#e8173a]/30 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-[13px] font-medium text-white/60">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  disabled={busy}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                  placeholder="••••••••"
                  data-testid="login-password"
                  className="w-full rounded-xl border border-white/10 bg-[#1e2024] py-3 pl-10 pr-11 text-sm text-white placeholder-white/25 outline-none transition focus:border-[#e8173a]/60 focus:ring-1 focus:ring-[#e8173a]/30 disabled:opacity-50"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition"
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C6 20 2 12 2 12a19.4 19.4 0 0 1 5.06-6.06M9.9 4.24A9.12 9.12 0 0 1 12 4c6 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div
                role="alert"
                data-testid="login-error"
                className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
              >
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={busy}
              data-testid="login-submit"
              className="relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#e8173a] to-[#ff4d6d] py-3.5 text-sm font-bold text-white shadow-[0_4px_24px_rgba(232,23,58,0.35)] transition hover:shadow-[0_4px_32px_rgba(232,23,58,0.5)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-[11px] text-white/20">
          Accounts are created by administrators only. Contact support if you need access.
        </p>
      </div>
    </div>
  );
}
