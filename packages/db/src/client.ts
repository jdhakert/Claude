import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

/**
 * Production database client (Postgres via postgres-js). Connection string from
 * the environment; never hardcode secrets (Charter §3). `casing: snake_case`
 * keeps TS camelCase while DB identifiers stay snake_case.
 */
export function createDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 10 });
  return drizzle(sql, { schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof createDb>;
