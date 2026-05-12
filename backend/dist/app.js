import cors from "cors";
import express from "express";
import { pinoHttp } from "pino-http";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createParticipantsRouter } from "./routes/participants.routes.js";
import { createInternalRouter } from "./routes/internal.routes.js";
import { createCompetitionOwnerRouter } from "./routes/competition-owner.routes.js";
import { createInvitesPublicRouter } from "./routes/invites-public.routes.js";
import { optionalBearerSupabaseJwt, requireBearerSupabaseJwt } from "./middleware/supabase-auth.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
export function createApp(deps) {
    const { env, logger, gateway } = deps;
    const app = express();
    app.disable("x-powered-by");
    app.use(pinoHttp({
        logger,
        customLogLevel(_req, res, err) {
            if (res.statusCode >= 500 || err)
                return "error";
            if (res.statusCode >= 400)
                return "warn";
            return "info";
        },
        customSuccessMessage(req, res, responseTime) {
            return `${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`;
        },
        customErrorMessage(req, _res, err) {
            return `${req.method} ${req.url} failed: ${err.message}`;
        },
    }));
    app.use(cors());
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
    app.use("/api/my-competitions", requireBearerSupabaseJwt(env), createCompetitionOwnerRouter(gateway, env, logger));
    app.use("/api/internal", optionalBearerSupabaseJwt(env), createInternalRouter(gateway, env, logger));
    app.use("/api", createParticipantsRouter(gateway, env, logger));
    app.use(notFoundHandler);
    app.use(createErrorHandler(logger));
    return app;
}
//# sourceMappingURL=app.js.map