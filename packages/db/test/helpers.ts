import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/schema/index";

/**
 * Spin up an in-process Postgres (PGlite), apply the real generated migrations,
 * and return a typed drizzle client. Gives portable, Docker-free relationship
 * tests with true Postgres semantics (FKs, enums, jsonb).
 */
export async function makeTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: "snake_case" });
  await migrate(db, {
    migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
  });
  return { db, client };
}

export type TestDb = Awaited<ReturnType<typeof makeTestDb>>["db"];
