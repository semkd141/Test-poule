/**
 * After a first-time fixture statistics sync from API-Football, apply goal `punten` to every
 * `player_points_rollup` row for that pool + league + season + `player_id`, then refresh `teams.total_points`.
 * Idempotent per team per match via `participant_score_events` (`fixture_goals:p{playerId}`).
 */
export function startFixtureGoalRollupBackground(opts, gateway, log) {
    void runFixtureGoalRollupJob(opts, gateway, log).catch((e) => {
        log.error({ err: e, opts }, "fixture goal rollup job crashed");
    });
}
function aggregateGoalPuntenByPlayerId(raw) {
    const out = new Map();
    if (!Array.isArray(raw))
        return out;
    for (const row of raw) {
        if (!row || typeof row !== "object" || Array.isArray(row))
            continue;
        const rec = row;
        const pid = rec.player_id;
        const playerId = pid != null && Number.isFinite(Number(pid)) && Number(pid) > 0 ? Math.floor(Number(pid)) : null;
        if (playerId == null)
            continue;
        const punten = Math.floor(Number(rec.punten)) || 0;
        if (punten <= 0)
            continue;
        out.set(playerId, (out.get(playerId) ?? 0) + punten);
    }
    return out;
}
async function runFixtureGoalRollupJob(opts, gateway, log) {
    const { competitionId, externalFixtureId, matchId } = opts;
    if (!Number.isFinite(competitionId) || competitionId <= 0)
        return;
    if (!Number.isFinite(externalFixtureId) || externalFixtureId <= 0)
        return;
    if (!Number.isFinite(matchId) || matchId <= 0)
        return;
    const comp = await gateway.getCompetitionById(String(competitionId));
    if (!comp) {
        log.warn({ competitionId }, "fixture goal rollup: competition not found");
        return;
    }
    const scope = gateway.getFixtureMappingScopeForCompetition(comp);
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
    const teamsToRecompute = new Set();
    for (const [playerId, punten] of byPlayer) {
        const rollupsRaw = await gateway.listPlayerRollupsByCompetitionLeagueSeasonPlayer(competitionId, scope.leagueId, scope.season, playerId);
        const rollups = Array.isArray(rollupsRaw) ? rollupsRaw : [];
        const eventKey = `fixture_goals:p${playerId}`;
        for (const rr of rollups) {
            if (!rr || typeof rr !== "object" || Array.isArray(rr))
                continue;
            const r = rr;
            const rollupId = r.id != null ? String(r.id) : "";
            const teamId = Number(r.team_id);
            const curPts = Math.floor(Number(r.points)) || 0;
            if (!rollupId || !Number.isFinite(teamId) || teamId <= 0)
                continue;
            try {
                const applied = await gateway.insertScoreEventIfMissing(teamId, matchId, eventKey, punten);
                if (applied) {
                    await gateway.patchPlayerRollupById(rollupId, { points: curPts + punten });
                    teamsToRecompute.add(String(teamId));
                }
            }
            catch (e) {
                log.error({ err: e, teamId, matchId, playerId, punten }, "fixture goal rollup: row failed");
            }
        }
    }
    for (const tid of teamsToRecompute) {
        try {
            await gateway.recomputeTeamTotalPointsFromRollups(tid);
        }
        catch (e) {
            log.error({ err: e, teamId: tid }, "fixture goal rollup: recompute team total failed");
        }
    }
    log.info({ competitionId, externalFixtureId, matchId, players: byPlayer.size, teams: teamsToRecompute.size }, "fixture goal rollup job finished");
}
//# sourceMappingURL=fixture-goal-rollup-job.service.js.map