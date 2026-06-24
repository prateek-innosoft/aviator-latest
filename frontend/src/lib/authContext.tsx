import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface SimpleSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface UserProfile {
  id:           string;
  email:        string;
  username:     string | null;
  display_name: string | null;
  role:         "user" | "admin" | "superadmin";
  kyc_status:   string;
  balance:      number;
  currency:     string;
}

interface AuthState {
  session:   SimpleSession | null;
  profile:   UserProfile | null;
  loading:   boolean;
  error:     string | null;
}

interface AuthContextValue extends AuthState {
  login:        (email: string, password: string) => Promise<{ ok: boolean; reason?: string }>;
  logout:       () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError:   () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    loading: true,
    error:   null,
  });

  const fetchProfile = useCallback(async (session: SimpleSession): Promise<UserProfile | null> => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.ok ? (json.user as UserProfile) : null;
    } catch {
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const raw = localStorage.getItem("aviator_admin_session");
    if (!raw) return;
    const session: SimpleSession = JSON.parse(raw);
    const profile = await fetchProfile(session);
    setState((s) => ({ ...s, profile }));
  }, [fetchProfile]);

  useEffect(() => {
    // Initial session check from localStorage
    const raw = localStorage.getItem("aviator_admin_session");
    if (raw) {
      const session: SimpleSession = JSON.parse(raw);
      // Check if token is expired
      if (session.expires_at * 1000 > Date.now()) {
        fetchProfile(session).then((profile) => {
          setState({ session, profile, loading: false, error: null });
        });
      } else {
        localStorage.removeItem("aviator_admin_session");
        setState({ session: null, profile: null, loading: false, error: null });
      }
    } else {
      setState({ session: null, profile: null, loading: false, error: null });
    }
  }, [fetchProfile]);

  const login = useCallback(
    async (email: string, password: string): Promise<{ ok: boolean; reason?: string }> => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetch("/api/auth/login", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ email, password }),
        });
        const json = await res.json();
        if (!json.ok) {
          const msg =
            json.reason === "invalid_credentials" ? "Invalid email or password" :
            json.reason === "too_many_attempts"   ? "Too many attempts. Try again in 15 min." :
            json.reason === "validation"          ? "Invalid input" :
            "Login failed. Please try again.";
          setState((s) => ({ ...s, loading: false, error: msg }));
          return { ok: false, reason: json.reason };
        }

        // Store the session in localStorage (simple token-based auth)
        const session: SimpleSession = {
          access_token:  json.access_token,
          refresh_token: json.refresh_token,
          expires_at:    json.expires_at,
        };
        localStorage.setItem("aviator_admin_session", JSON.stringify(session));

        const profile: UserProfile = json.user;
        setState({ session, profile, loading: false, error: null });
        return { ok: true };
      } catch {
        setState((s) => ({ ...s, loading: false, error: "Network error" }));
        return { ok: false, reason: "network" };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    const session = state.session;
    if (session) {
      try {
        await fetch("/api/auth/logout", {
          method:  "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch { /* ignore */ }
    }
    localStorage.removeItem("aviator_admin_session");
    setState({ session: null, profile: null, loading: false, error: null });
  }, [state.session]);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshProfile, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
