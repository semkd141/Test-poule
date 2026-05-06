import pino from "pino";
import type { Env } from "../config/env.js";

export type AppLogger = pino.Logger;

export function createLogger(env: Env): AppLogger {
  const isDev = env.NODE_ENV === "development";

  return pino({
    level: env.LOG_LEVEL,
    ...(isDev
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname",
            },
          },
        }
      : {}),
    base: { env: env.NODE_ENV },
  });
}
