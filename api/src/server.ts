import { createDb } from "@barready/db";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const db = env.DATABASE_URL ? createDb(env.DATABASE_URL) : undefined;
  const app = await buildApp({ env, db });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      app.log.info({ signal }, "shutting down");
      void app.close().then(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
