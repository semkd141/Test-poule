import { HttpError } from "../shared/http-error.js";
import { UpstreamHttpError } from "../shared/upstream-error.js";
export function createErrorHandler(logger) {
    return (err, req, res, _next) => {
        if (err instanceof UpstreamHttpError) {
            logger.debug({ status: err.status, req: { method: req.method, url: req.url }, payload: err.payload }, "upstream error forwarded to client");
            if (typeof err.payload === "object" && err.payload !== null) {
                res.status(err.status).json(err.payload);
            }
            else {
                res.status(err.status).json({ error: String(err.payload) });
            }
            return;
        }
        const status = err instanceof HttpError ? err.statusCode : 500;
        const expose = err instanceof HttpError ? err.expose : false;
        if (status >= 500) {
            logger.error({
                err,
                req: { method: req.method, url: req.url },
            }, err instanceof Error ? err.message : "Internal error");
        }
        else {
            logger.debug({
                err,
                req: { method: req.method, url: req.url },
            }, err instanceof Error ? err.message : "Client error");
        }
        const body = expose && err instanceof Error
            ? { error: err.message }
            : status >= 500
                ? { error: "Internal Server Error" }
                : err instanceof Error
                    ? { error: err.message }
                    : { error: "Error" };
        res.status(status).json(body);
    };
}
//# sourceMappingURL=error-handler.js.map