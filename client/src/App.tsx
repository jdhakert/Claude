import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { LoadingState } from "./components/states";
import { Landing } from "./routes/Landing";
import { Login } from "./routes/Login";
import { Dashboard } from "./routes/Dashboard";
import { Courses } from "./routes/Courses";
import { Course } from "./routes/Course";
import { Lesson } from "./routes/Lesson";
import { ContentAdmin } from "./routes/admin/ContentAdmin";
import { NotFound } from "./routes/NotFound";

function Protected({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: string[];
}) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !user.roles.some((r) => roles.includes(r))) {
    return (
      <AppLayout>
        <p className="state state--error">
          You don’t have access to this area.
        </p>
      </AppLayout>
    );
  }
  return <AppLayout>{children}</AppLayout>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/courses"
        element={
          <Protected>
            <Courses />
          </Protected>
        }
      />
      <Route
        path="/courses/:courseId"
        element={
          <Protected>
            <Course />
          </Protected>
        }
      />
      <Route
        path="/lessons/:lessonId"
        element={
          <Protected>
            <Lesson />
          </Protected>
        }
      />
      <Route
        path="/admin/content"
        element={
          <Protected roles={["content_author", "content_reviewer", "admin"]}>
            <ContentAdmin />
          </Protected>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
