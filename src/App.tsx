import { Routes, Route, Navigate } from "react-router";
import { useAuth } from "./hooks/useAuth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import ForceChangePassword from "./components/ForceChangePassword";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Batches from "./pages/Batches";
import Chat from "./pages/Chat";
import Classes from "./pages/Classes";
import Fees from "./pages/Fees";
import Reports from "./pages/Reports";
import Notifications from "./pages/Notifications";
import Discipline from "./pages/Discipline";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import PrivateChat from "./pages/PrivateChat";
import Requests from "./pages/Requests";
import Salaries from "./pages/Salaries";
import Feedback from "./pages/Feedback";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <ForceChangePassword />;
  return <Layout>{children}</Layout>;
}

function RegisterRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!user) {
    return (
      <Navigate
        to="/login?reason=Self-registration+is+disabled.+Please+contact+an+administrator+to+create+an+account."
        replace
      />
    );
  }

  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user.role);
  if (isAdmin) {
    return <Navigate to="/users" replace />;
  }

  return <Navigate to="/?reason=You+do+not+have+permission+to+access+the+registration+page." replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<RegisterRoute />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
      <Route path="/batches" element={<ProtectedRoute><Batches /></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      <Route path="/messages" element={<ProtectedRoute><PrivateChat /></ProtectedRoute>} />
      <Route path="/classes" element={<ProtectedRoute><Classes /></ProtectedRoute>} />
      <Route path="/fees" element={<ProtectedRoute><Fees /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/discipline" element={<ProtectedRoute><Discipline /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />
      <Route path="/salaries" element={<ProtectedRoute><Salaries /></ProtectedRoute>} />
      <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
