import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";

describe("API integration: health", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ env: loadEnv({ NODE_ENV: "test" }) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok with uptime", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptimeSeconds).toBe("number");
  });

  it("GET /healthz and /readyz respond", async () => {
    expect((await app.inject({ url: "/healthz" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/readyz" })).statusCode).toBe(200);
  });

  it("unknown route returns a structured 404", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
  });
});

describe("env validation", () => {
  it("rejects an invalid PORT", () => {
    expect(() => loadEnv({ PORT: "-1" } as NodeJS.ProcessEnv)).toThrow(
      /Invalid environment/,
    );
  });
});
