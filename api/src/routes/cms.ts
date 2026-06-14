import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { requireRole } from "../auth/guards.js";
import {
  CONTENT_KINDS,
  CmsError,
  cmsDashboard,
  contentHistory,
  listContent,
  transition,
  type Action,
  type ContentKind,
} from "../services/cms.js";

const REVIEWER_ACTIONS: Action[] = ["approve", "reject", "publish", "archive"];

function asKind(k: string): ContentKind {
  if (!CONTENT_KINDS.includes(k as ContentKind))
    throw new AppError(404, "not_found", "Unknown content kind.");
  return k as ContentKind;
}

export async function cmsRoutes(app: FastifyInstance): Promise<void> {
  const authorGuard = {
    preHandler: requireRole("content_author", "content_reviewer", "admin"),
  };

  // Admin dashboard: content counts per kind per status.
  app.get("/admin/cms/dashboard", authorGuard, async () => ({
    summary: await cmsDashboard(app.db),
  }));

  // List + search/filter a content kind.
  app.get("/admin/cms/:kind", authorGuard, async (request) => {
    const kind = asKind((request.params as { kind: string }).kind);
    const q = request.query as { status?: string; q?: string };
    return {
      items: await listContent(app.db, kind, {
        status: q.status as never,
        q: q.q,
      }),
    };
  });

  // Audit/version history.
  app.get("/admin/cms/:kind/:id/history", authorGuard, async (request) => {
    const { kind, id } = request.params as { kind: string; id: string };
    return { history: await contentHistory(app.db, asKind(kind), id) };
  });

  // Lifecycle transition.
  const TransitionSchema = z.object({
    action: z.enum(["submit", "approve", "reject", "publish", "archive"]),
  });
  app.post("/admin/cms/:kind/:id/transition", authorGuard, async (request) => {
    const { kind, id } = request.params as { kind: string; id: string };
    const parsed = TransitionSchema.safeParse(request.body);
    if (!parsed.success)
      throw new AppError(400, "bad_request", "Invalid action.");
    const action = parsed.data.action;

    // Reviewer/admin only for approve/reject/publish/archive.
    const roles = request.user?.roles ?? [];
    const privileged = roles.some((r) =>
      ["content_reviewer", "admin"].includes(r),
    );
    if (REVIEWER_ACTIONS.includes(action) && !privileged)
      throw new AppError(
        403,
        "forbidden",
        "Only reviewers/admins can approve, publish, or archive.",
      );

    try {
      const result = await transition(
        app.db,
        request.user!.id,
        asKind(kind),
        id,
        action,
      );
      return { content: result };
    } catch (err) {
      if (err instanceof CmsError) {
        const status =
          err.code === "missing_license_metadata"
            ? 400
            : err.code === "not_found"
              ? 404
              : 409;
        throw new AppError(status, err.code, err.message);
      }
      throw err;
    }
  });
}
