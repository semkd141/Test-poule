import type { IncomingMessage, ServerResponse } from "http";
import cors from "cors";
import express from "express";
import { pinoHttp } from "pino-http";
import type { Env } from "./config/env.js";
import type { AppLogger } from "./lib/logger.js";
import type { SupabaseGateway } from "./services/supabase-gateway.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createParticipantsRouter } from "./routes/participants.routes.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";

export interface CreateAppDeps {
  env: Env;
  logger: AppLogger;
  gateway: SupabaseGateway;
}

export function createApp(deps: CreateAppDeps): express.Express {
  const { env, logger, gateway } = deps;

  const app = express();

  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      customLogLevel(_req: IncomingMessage, res: ServerResponse, err?: Error) {
        if (res.statusCode >= 500 || err) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      customSuccessMessage(req: IncomingMessage, res: ServerResponse, responseTime: number) {
        return `${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`;
      },
      customErrorMessage(req: IncomingMessage, _res: ServerResponse, err: Error) {
        return `${req.method} ${req.url} failed: ${err.message}`;
      },
    }),
  );

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.json({ message: "API is running with TypeScript", env: env.NODE_ENV });
  });

  app.use("/api/auth", createAuthRouter(gateway));
  app.use("/api", createParticipantsRouter(gateway));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
