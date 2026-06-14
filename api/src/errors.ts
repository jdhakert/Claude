import type { FastifyInstance } from "fastify";

/** Typed application error carrying an HTTP status and a stable code. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (message = "Not found") =>
  new AppError(404, "not_found", message);

/**
 * Central error handler. User-facing responses never leak stack traces or
 * internal identifiers in production (Charter §3); the full error is logged.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
      return;
    }

    // Fastify validation errors → 400 with a safe message.
    if ((error as { validation?: unknown }).validation) {
      reply
        .status(400)
        .send({ error: { code: "bad_request", message: "Invalid request." } });
      return;
    }

    // Honor framework client-errors (e.g. malformed/empty body) as 4xx, not 500.
    const fe = error as { statusCode?: number; code?: string };
    if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
      reply.status(fe.statusCode).send({
        error: { code: fe.code ?? "bad_request", message: "Invalid request." },
      });
      return;
    }

    request.log.error({ err: error }, "unhandled error");
    const isProd = process.env.NODE_ENV === "production";
    reply.status(500).send({
      error: {
        code: "internal_error",
        message: isProd ? "Something went wrong." : (error as Error).message,
      },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply
      .status(404)
      .send({ error: { code: "not_found", message: "Route not found." } });
  });
}
