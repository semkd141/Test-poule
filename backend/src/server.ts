import "dotenv/config";

import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { SupabaseGateway } from "./services/supabase-gateway.js";
import { createApp } from "./app.js";

const env = loadEnv();
const logger = createLogger(env);

const brevoKey = env.BREVO_API_KEY?.trim() ?? "";
const brevoSmtpNoExplicitLogin =
  brevoKey.startsWith("xsmtpsib-") &&
  !env.BREVO_REST_API_KEY?.trim() &&
  !env.BREVO_SMTP_LOGIN?.trim();
if (brevoSmtpNoExplicitLogin) {
  logger.warn(
    "Brevo SMTP: BREVO_SMTP_LOGIN is unset — SMTP auth must use the login from Brevo → SMTP & API → SMTP (not your From address). Set BREVO_SMTP_LOGIN or add BREVO_REST_API_KEY (xkeysib-) to use the REST API instead.",
  );
}

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
process.on("uncaughtException", (error) => {
  logger.error({ error }, "uncaught exception");
  process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "unhandled rejection");
  process.exit(1);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  logger.error({ error }, "server error");
  if (error.code === "EADDRINUSE") {
    logger.error(`Port ${env.PORT} is already in use`);
  }
  process.exit(1);
});
