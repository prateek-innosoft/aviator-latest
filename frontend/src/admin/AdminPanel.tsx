import { useAuth } from "../lib/authContext";
import { RateControlPanel } from "./RateControlPanel";

export function AdminPanel() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  return (
    <div data-testid="admin-panel">
      <RateControlPanel token={token} />
    </div>
  );
}
