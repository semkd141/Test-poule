import { DEFAULT_DEADLINE, DEFAULT_DEADLINE_LABEL } from "./config";

export type PouleConfig = {
  deadline: Date;
  deadlineLabel: string;
  cfgRowId?: number;
};

/** Config row uses email = "__config__"; spelers JSON holds { deadline, deadlineLabel } */
export function parseConfig(participants: Array<{ id?: number; email?: string; spelers?: unknown }>): PouleConfig {
  const cfgRow = (participants || []).find((p) => p.email === "__config__");
  if (!cfgRow) {
    return { deadline: new Date(DEFAULT_DEADLINE), deadlineLabel: DEFAULT_DEADLINE_LABEL };
  }
  let cfg: Record<string, unknown> = {};
  const raw = cfgRow.spelers;
  if (typeof raw === "string") {
    try {
      cfg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      cfg = {};
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    cfg = raw as Record<string, unknown>;
  }
  return {
    deadline: cfg.deadline ? new Date(String(cfg.deadline)) : new Date(DEFAULT_DEADLINE),
    deadlineLabel: (cfg.deadlineLabel as string) || DEFAULT_DEADLINE_LABEL,
    cfgRowId: cfgRow.id,
  };
}
