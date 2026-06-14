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
import { Practice } from "./routes/Practice";
import { Exams } from "./routes/exam/Exams";
import { ExamRunner } from "./routes/exam/ExamRunner";
import { ExamResults } from "./routes/exam/ExamResults";
import { Essays } from "./routes/essay/Essays";
import { EssayWriter } from "./routes/essay/EssayWriter";
import { GraderQueue } from "./routes/essay/GraderQueue";
import { PtTasks } from "./routes/pt/PtTasks";
import { PtWorkspace } from "./routes/pt/PtWorkspace";
import { Review } from "./routes/Review";
import { Analytics } from "./routes/Analytics";
import { Remediation } from "./routes/Remediation";
import { Account } from "./routes/Account";
import { AdminAnalytics } from "./routes/admin/AdminAnalytics";
import { AdminCms } from "./routes/admin/AdminCms";
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
        path="/practice"
        element={
          <Protected>
            <Practice />
          </Protected>
        }
      />
      <Route
        path="/exams"
        element={
          <Protected>
            <Exams />
          </Protected>
        }
      />
      <Route
        path="/exam-attempts/:attemptId"
        element={
          <Protected>
            <ExamRunner />
          </Protected>
        }
      />
      <Route
        path="/exam-attempts/:attemptId/results"
        element={
          <Protected>
            <ExamResults />
          </Protected>
        }
      />
      <Route
        path="/essays"
        element={
          <Protected>
            <Essays />
          </Protected>
        }
      />
      <Route
        path="/essays/:essayId"
        element={
          <Protected>
            <EssayWriter />
          </Protected>
        }
      />
      <Route
        path="/grader/essays"
        element={
          <Protected roles={["grader", "instructor", "admin"]}>
            <GraderQueue />
          </Protected>
        }
      />
      <Route
        path="/pt"
        element={
          <Protected>
            <PtTasks />
          </Protected>
        }
      />
      <Route
        path="/pt/:taskId"
        element={
          <Protected>
            <PtWorkspace />
          </Protected>
        }
      />
      <Route
        path="/review"
        element={
          <Protected>
            <Review />
          </Protected>
        }
      />
      <Route
        path="/analytics"
        element={
          <Protected>
            <Analytics />
          </Protected>
        }
      />
      <Route
        path="/remediation"
        element={
          <Protected>
            <Remediation />
          </Protected>
        }
      />
      <Route
        path="/account"
        element={
          <Protected>
            <Account />
          </Protected>
        }
      />
      <Route
        path="/admin/analytics"
        element={
          <Protected roles={["instructor", "admin"]}>
            <AdminAnalytics />
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
      <Route
        path="/admin/cms"
        element={
          <Protected roles={["content_author", "content_reviewer", "admin"]}>
            <AdminCms />
          </Protected>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
