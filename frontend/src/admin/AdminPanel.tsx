import { useAuth } from "../lib/authContext";
import { RateControlPanel, AdminLogin } from "./RateControlPanel";

export function AdminPanel() {
  const { session, profile, loading } = useAuth();


  // Show spinner while session resolves
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8]">
        <svg className="h-8 w-8 animate-spin text-[#e8173a]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  // If no session, or not an admin role, show the admin login screen
  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";
  if (!session || !isAdmin) {
    return <AdminLogin onLogin={() => {}} />;
  }

  const token = session.access_token;
  return (
    <div data-testid="admin-panel">
      <RateControlPanel token={token} />
    </div>
  );
}
