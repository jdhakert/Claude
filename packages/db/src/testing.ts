import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema/index";

export type TestDbHandle = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  client: PGlite;
};

/**
 * Spin up an in-process Postgres (PGlite), apply the real generated migrations,
 * and return a typed drizzle client. Shared by db tests and any package that
 * needs a Docker-free, true-Postgres test database (e.g. the API).
 */
export async function makeTestDb(): Promise<TestDbHandle> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: "snake_case" });
  await migrate(db, {
    migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
  });
  return { db, client };
}
