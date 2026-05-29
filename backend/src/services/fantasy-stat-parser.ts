export const FANTASY_POINTS = {
  goal: 5,
  assist: 3,
  yellowCard: -1,
  redCard: -3,
  penaltyMissed: -2,
  penaltySaved: 5,
  cleanSheet: 4,
} as const;

export type FantasyStatKey = keyof typeof FANTASY_POINTS;

export type FantasyStatBreakdown = {
  key: FantasyStatKey;
  count: number;
  points: number;
};

export type FantasyPlayerDelta = {
  playerId: number;
  playerName: string;
  teamName: string;
  position: string;
  minutes: number;
  goalsConceded: number;
  totalPoints: number;
  breakdown: FantasyStatBreakdown[];
};

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function nested(obj: unknown, path: string[]): unknown {
  let cur = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function isCleanSheetPosition(position: string): boolean {
  const p = position.trim().toLowerCase();
  return ["g", "gk", "goalkeeper", "d", "def", "defender"].includes(p);
}

function addStat(
  out: FantasyStatBreakdown[],
  key: FantasyStatKey,
  count: number,
): void {
  const whole = Math.floor(num(count));
  if (whole <= 0) return;
  out.push({
    key,
    count: whole,
    points: whole * FANTASY_POINTS[key],
  });
}

export function extractFantasyPlayerDeltas(
  playerGroups: unknown[],
  teamGoalsConceded: Record<string, number> = {},
): FantasyPlayerDelta[] {
  const out: FantasyPlayerDelta[] = [];

  for (const group of playerGroups) {
    const teamName = text(nested(group, ["team", "name"]));
    const players = nested(group, ["players"]);
    if (!Array.isArray(players)) continue;

    for (const row of players) {
      const playerId = Math.floor(num(nested(row, ["player", "id"])));
      if (!Number.isFinite(playerId) || playerId <= 0) continue;

      const stat = Array.isArray((row as Record<string, unknown>).statistics)
        ? ((row as { statistics: unknown[] }).statistics[0] ?? {})
        : {};
      const position = text(nested(stat, ["games", "position"]));
      const minutes = Math.floor(num(nested(stat, ["games", "minutes"])));
      const goalsConceded =
        teamGoalsConceded[teamName] ?? Math.floor(num(nested(stat, ["goals", "conceded"])));
      const breakdown: FantasyStatBreakdown[] = [];

      addStat(breakdown, "goal", num(nested(stat, ["goals", "total"])));
      addStat(breakdown, "assist", num(nested(stat, ["goals", "assists"])));
      addStat(breakdown, "yellowCard", num(nested(stat, ["cards", "yellow"])));
      addStat(breakdown, "redCard", num(nested(stat, ["cards", "red"])));
      addStat(breakdown, "penaltyMissed", num(nested(stat, ["penalty", "missed"])));
      addStat(breakdown, "penaltySaved", num(nested(stat, ["penalty", "saved"])));

      if (minutes >= 60 && goalsConceded === 0 && isCleanSheetPosition(position)) {
        addStat(breakdown, "cleanSheet", 1);
      }

      const totalPoints = breakdown.reduce((sum, item) => sum + item.points, 0);
      out.push({
        playerId,
        playerName: text(nested(row, ["player", "name"])),
        teamName,
        position,
        minutes,
        goalsConceded,
        totalPoints,
        breakdown,
      });
    }
  }

  return out;
}

export function statFieldKeysFromPlayerGroups(playerGroups: unknown[]): string[] {
  const keys = new Set<string>();
  for (const group of playerGroups) {
    const players = nested(group, ["players"]);
    if (!Array.isArray(players)) continue;
    for (const row of players) {
      const stat = Array.isArray((row as Record<string, unknown>).statistics)
        ? ((row as { statistics: unknown[] }).statistics[0] ?? {})
        : {};
      if (!stat || typeof stat !== "object" || Array.isArray(stat)) continue;
      for (const [section, value] of Object.entries(stat as Record<string, unknown>)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          for (const key of Object.keys(value)) keys.add(`${section}.${key}`);
        } else {
          keys.add(section);
        }
      }
    }
  }
  return [...keys].sort();
}
