import { schema } from "@barready/db";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * Drizzle database typed with the BarReady schema. Accepts both the production
 * postgres-js client and the PGlite test client (both extend PgDatabase). The
 * `any` HKT slot avoids driver-specific query-result variance friction.
 */
export type AppDb = PgDatabase<any, typeof schema, any>;
