import pino from "pino";
import { resolve } from "node:path";
export function createLogger(env) {
    const logDir = resolve(process.cwd(), "log");
    const appLogPath = resolve(logDir, "app.log");
    const errorLogPath = resolve(logDir, "error.log");
    const appLogStream = pino.destination({ dest: appLogPath, mkdir: true, sync: false });
    const errorLogStream = pino.destination({ dest: errorLogPath, mkdir: true, sync: false });
    return pino({
        level: env.LOG_LEVEL,
        base: { env: env.NODE_ENV },
    }, pino.multistream([
        { stream: appLogStream },
        { level: "error", stream: errorLogStream },
    ]));
}
//# sourceMappingURL=logger.js.map