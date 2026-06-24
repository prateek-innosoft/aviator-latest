import { AdminPanel } from "./admin/AdminPanel";
import { AuthProvider } from "./lib/authContext";

export default function App() {
  return (
    <AuthProvider>
      <AdminPanel />
    </AuthProvider>
  );
}
