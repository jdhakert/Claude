import type { FastifyInstance } from "fastify";

const startedAt = Date.now();

/**
 * Health check (Charter §6 observability). Liveness + basic readiness signal.
 * Kept dependency-free so it works even when downstreams are degraded.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok" as const,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  }));

  // Kubernetes-style aliases.
  app.get("/healthz", async () => ({ status: "ok" as const }));
  app.get("/readyz", async () => ({ status: "ready" as const }));
}
