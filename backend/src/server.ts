import "dotenv/config";

import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { SupabaseGateway } from "./services/supabase-gateway.js";
import { createApp } from "./app.js";

const env = loadEnv();
const logger = createLogger(env);
const gateway = new SupabaseGateway(env, logger.child({ component: "supabase" }));

const app = createApp({ env, logger: logger.child({ component: "http" }), gateway });

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "server listening");
});

function shutdown(signal: string) {
  logger.info({ signal }, "shutdown requested");
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forced exit after graceful shutdown timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
