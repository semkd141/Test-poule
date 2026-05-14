import pino from "pino";
import { resolve } from "node:path";
import type { Env } from "../config/env.js";

export type AppLogger = pino.Logger;

export function createLogger(env: Env): AppLogger {
  const logDir = resolve(process.cwd(), "log");
  const appLogPath = resolve(logDir, "app.log");
  const errorLogPath = resolve(logDir, "error.log");
  const appLogStream = pino.destination({ dest: appLogPath, mkdir: true, sync: false });
  const errorLogStream = pino.destination({ dest: errorLogPath, mkdir: true, sync: false });

  const streams = [
    { stream: appLogStream },
    { level: "error", stream: errorLogStream },
  ];

  // Add console output in development
  if (env.NODE_ENV === "development") {
    streams.push({ stream: pino.destination(1) });
  }

  return pino(
    {
      level: env.LOG_LEVEL,
      base: { env: env.NODE_ENV },
    },
    pino.multistream(streams),
  );
}
