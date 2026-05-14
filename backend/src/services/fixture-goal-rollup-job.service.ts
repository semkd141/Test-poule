import type { AppLogger } from "../lib/logger.js";
import type { SupabaseGateway } from "./supabase-gateway.js";

export type FixtureGoalRollupJobOpts = {
  competitionId: number;
  /** API-Football `fixtures.id` (same as `matches.external_fixture_id` / `player_statistics.fixture_id`). */
  externalFixtureId: number;
};

/**
 * After fixture statistics are loaded, apply goal `punten` from `player_statistics` to
 * `player_points_rollup` (all rows for league + season + player_id), then refresh `teams.total_points`.
 * Idempotent per fixture via `matches.applied` (no `participant_score_events`).
 */
export function startFixtureGoalRollupBackground(
  opts: FixtureGoalRollupJobOpts,
  gateway: SupabaseGateway,
  log: AppLogger,
): void {
  void runFixtureGoalRollupJob(opts, gateway, log).catch((e) => {
    log.error({ err: e, opts }, "fixture goal rollup job crashed");
  });
}

function aggregateGoalPuntenByPlayerId(raw: unknown): Map<number, number> {
  const out = new Map<number, number>();
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rec = row as Record<string, unknown>;
    const pid = rec.player_id;
    const playerId =
      pid != null && Number.isFinite(Number(pid)) && Number(pid) > 0 ? Math.floor(Number(pid)) : null;
    if (playerId == null) continue;
    const punten = Math.floor(Number(rec.punten)) || 0;
    if (punten <= 0) continue;
    out.set(playerId, (out.get(playerId) ?? 0) + punten);
  }
  return out;
}

function matchAppliedTrue(row: Record<string, unknown>): boolean {
  const a = row.applied;
  return a === true || a === "true" || a === 1 || a === "t";
}

async function runFixtureGoalRollupJob(
  opts: FixtureGoalRollupJobOpts,
  gateway: SupabaseGateway,
  log: AppLogger,
): Promise<void> {
  const { competitionId, externalFixtureId } = opts;
  if (!Number.isFinite(competitionId) || competitionId <= 0) return;
  if (!Number.isFinite(externalFixtureId) || externalFixtureId <= 0) return;

  const matchRow = await gateway.getMatchByExternalFixtureId(externalFixtureId);
  if (!matchRow) {
    log.warn({ externalFixtureId }, "fixture goal rollup: no match row for fixture");
    return;
  }
  if (matchAppliedTrue(matchRow)) {
    log.info({ externalFixtureId }, "fixture goal rollup: matches.applied already true; skip");
    return;
  }

  const comp = await gateway.getCompetitionById(String(competitionId));
  if (!comp) {
    log.warn({ competitionId }, "fixture goal rollup: competition not found");
    return;
  }
  const scope = gateway.getFixtureMappingScopeForCompetition(comp as Record<string, unknown>);
  if (!scope) {
    log.warn({ competitionId }, "fixture goal rollup: no API-Football league/season on competition; skip");
    return;
  }

  const statsRaw = await gateway.listPlayerStatisticsByFixture(externalFixtureId);
  const byPlayer = aggregateGoalPuntenByPlayerId(statsRaw);
  if (byPlayer.size === 0) {
    log.info({ externalFixtureId }, "fixture goal rollup: no players with punten > 0 and player_id");
    return;
  }

  const teamsToRecompute = new Set<string>();
  let patchedAnyRollup = false;

  for (const [playerId, punten] of byPlayer) {
    const rollupsRaw = await gateway.listPlayerRollupsByLeagueSeasonPlayer(
      scope.leagueId,
      scope.season,
      playerId,
    );
    const rollups = Array.isArray(rollupsRaw) ? rollupsRaw : [];

    for (const rr of rollups) {
      if (!rr || typeof rr !== "object" || Array.isArray(rr)) continue;
      const r = rr as Record<string, unknown>;
      const rollupId = r.id != null ? String(r.id) : "";
      const teamId = Number(r.team_id);
      const curPts = Math.floor(Number(r.points)) || 0;
      if (!rollupId || !Number.isFinite(teamId) || teamId <= 0) continue;

      try {
        await gateway.patchPlayerRollupById(rollupId, { points: curPts + punten });
        patchedAnyRollup = true;
        teamsToRecompute.add(String(teamId));
      } catch (e) {
        log.error({ err: e, teamId, playerId, punten }, "fixture goal rollup: rollup patch failed");
      }
    }
  }

  for (const tid of teamsToRecompute) {
    try {
      await gateway.recomputeTeamTotalPointsFromRollups(tid);
    } catch (e) {
      log.error({ err: e, teamId: tid }, "fixture goal rollup: recompute team total failed");
    }
  }

  if (patchedAnyRollup) {
    await gateway.patchMatchByExternalFixtureId(externalFixtureId, { applied: true });
  }

  log.info(
    { competitionId, externalFixtureId, players: byPlayer.size, teams: teamsToRecompute.size },
    "fixture goal rollup job finished",
  );
}
