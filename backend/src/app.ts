import type { IncomingMessage, ServerResponse } from "http";
import cors from "cors";
import express from "express";
import { pinoHttp } from "pino-http";
import type { Env } from "./config/env.js";
import type { AppLogger } from "./lib/logger.js";
import type { SupabaseGateway } from "./services/supabase-gateway.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createParticipantsRouter } from "./routes/participants.routes.js";
import { createInternalRouter } from "./routes/internal.routes.js";
import { createCompetitionOwnerRouter } from "./routes/competition-owner.routes.js";
import { createInvitesPublicRouter } from "./routes/invites-public.routes.js";
import { optionalBearerSupabaseJwt, requireBearerSupabaseJwt } from "./middleware/supabase-auth.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";

export interface CreateAppDeps {
  env: Env;
  logger: AppLogger;
  gateway: SupabaseGateway;
}

const corsAllowedOrigins = new Set([
  "https://testpoule.vercel.app",
  "https://test-poule.vercel.app",
]);

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

  app.use(
    cors({
      origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (corsAllowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.json({ message: "API is running with TypeScript", env: env.NODE_ENV });
  });

  app.use((req, _res, next) => {
    if ((req.originalUrl ?? "").includes("my-competitions")) {
      // eslint-disable-next-line no-console
      console.error("[mc-debug]", req.method, req.originalUrl, "path=", req.path, "url=", req.url);
    }
    next();
  });

  app.use("/api/auth", optionalBearerSupabaseJwt(env), createAuthRouter(gateway, env));
  app.use("/api/invites", optionalBearerSupabaseJwt(env), createInvitesPublicRouter(gateway, env));
  // Register before `/api` participants router — a generic `/api` mount would otherwise swallow
  // `/api/my-competitions` and yield 404.
  app.use(
    "/api/my-competitions",
    requireBearerSupabaseJwt(env),
    createCompetitionOwnerRouter(gateway, env, logger),
  );
  app.use("/api/internal", optionalBearerSupabaseJwt(env), createInternalRouter(gateway, env, logger));
  app.use("/api", createParticipantsRouter(gateway, env, logger));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
