const BASE_DELTA = 3;
function winnerTeam(m) {
    if (m.home_goals === null || m.away_goals === null)
        return null;
    if (m.home_goals === m.away_goals)
        return null;
    return m.home_goals > m.away_goals ? m.home_team : m.away_team;
}
function normName(s) {
    return String(s ?? "")
        .trim()
        .toLowerCase();
}
function teamNameMatchesWinner(teamNames, winner) {
    const w = normName(winner);
    if (!w)
        return false;
    return teamNames.some((c) => normName(c) === w);
}
function isCoachPos(pos) {
    return normName(pos) === "coach";
}
export class ScoringEngine {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    /**
     * Idempotent scoring for matches with status FT/AET/PEN.
     * Uses participant_score_events unique keys to avoid duplicate scoring.
     * Picks + points live in `player_points_rollup` + `fixture_squad_members` (no `spelers` JSON).
     */
    async scoreCompetition(competitionId) {
        const matches = (await this.gateway.listScorableMatches(competitionId));
        const teams = (await this.gateway.listParticipantsByCompetition(competitionId));
        let touched = 0;
        const comp = await this.gateway.getCompetitionById(String(competitionId));
        const scope = comp && typeof comp === "object" && !Array.isArray(comp)
            ? this.gateway.getFixtureMappingScopeForCompetition(comp)
            : null;
        if (!scope) {
            return { matches: matches.length, participantsTouched: 0 };
        }
        const { leagueId, season } = scope;
        for (const m of matches) {
            const winner = winnerTeam(m);
            if (!winner)
                continue;
            const isFinal = String(m.round ?? "").toLowerCase().includes("final");
            for (const p of teams) {
                const rollupsRaw = await this.gateway.listPlayerRollupsByTeamLeagueSeason(p.id, leagueId, season);
                const rollups = (Array.isArray(rollupsRaw) ? rollupsRaw : []);
                if (rollups.length === 0)
                    continue;
                let changed = false;
                for (const r of rollups) {
                    const pid = Number(r.player_id);
                    if (!Number.isFinite(pid) || pid <= 0)
                        continue;
                    const teamNames = await this.gateway.listFixtureSquadTeamsForPlayer(pid, leagueId, season);
                    if (!teamNameMatchesWinner(teamNames, winner))
                        continue;
                    const curPts = Number(r.points) || 0;
                    const winKey = `winner:${m.id}:p${pid}`;
                    const winApply = await this.gateway.insertScoreEventIfMissing(p.id, m.id, winKey, BASE_DELTA);
                    if (winApply) {
                        await this.gateway.patchPlayerRollupById(String(r.id), { points: curPts + BASE_DELTA });
                        r.points = curPts + BASE_DELTA;
                        changed = true;
                    }
                    if (r.is_captain === true || r.is_captain === "true") {
                        const capKey = `captain:${m.id}:p${pid}`;
                        const ptsAfter = Number(r.points) || 0;
                        const capApply = await this.gateway.insertScoreEventIfMissing(p.id, m.id, capKey, BASE_DELTA);
                        if (capApply) {
                            await this.gateway.patchPlayerRollupById(String(r.id), { points: ptsAfter + BASE_DELTA });
                            r.points = ptsAfter + BASE_DELTA;
                            changed = true;
                        }
                    }
                    if (isFinal && isCoachPos(r.pos)) {
                        const ptsAfter = Number(r.points) || 0;
                        const champKey = `champion:${m.id}:p${pid}`;
                        const champApply = await this.gateway.insertScoreEventIfMissing(p.id, m.id, champKey, BASE_DELTA);
                        if (champApply) {
                            await this.gateway.patchPlayerRollupById(String(r.id), { points: ptsAfter + BASE_DELTA });
                            r.points = ptsAfter + BASE_DELTA;
                            changed = true;
                        }
                    }
                }
                if (changed)
                    touched += 1;
            }
        }
        for (const p of teams) {
            await this.gateway.recomputeTeamTotalPointsFromRollups(String(p.id));
        }
        return { matches: matches.length, participantsTouched: touched };
    }
}
//# sourceMappingURL=scoring-engine.js.map