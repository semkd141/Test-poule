import type { AppLogger } from "../lib/logger.js";
import type { SupabaseGateway } from "./supabase-gateway.js";
export type FixtureGoalRollupJobOpts = {
    competitionId: number;
    /** API-Football `fixtures.id` (same as `matches.external_fixture_id` / `player_statistics.fixture_id`). */
    externalFixtureId: number;
    /** Internal `matches.id` for `participant_score_events.match_id`. */
    matchId: number;
};
/**
 * After a first-time fixture statistics sync from API-Football, apply goal `punten` to every
 * `player_points_rollup` row for that pool + league + season + `player_id`, then refresh `teams.total_points`.
 * Idempotent per team per match via `participant_score_events` (`fixture_goals:p{playerId}`).
 */
export declare function startFixtureGoalRollupBackground(opts: FixtureGoalRollupJobOpts, gateway: SupabaseGateway, log: AppLogger): void;
//# sourceMappingURL=fixture-goal-rollup-job.service.d.ts.map