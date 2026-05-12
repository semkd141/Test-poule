import type { SupabaseGateway } from "./supabase-gateway.js";
export declare class ScoringEngine {
    private readonly gateway;
    constructor(gateway: SupabaseGateway);
    /**
     * Idempotent scoring for matches with status FT/AET/PEN.
     * Uses participant_score_events unique keys to avoid duplicate scoring.
     * Picks + points live in `player_points_rollup` + `fixture_squad_members` (no `spelers` JSON).
     */
    scoreCompetition(competitionId: number): Promise<{
        matches: number;
        participantsTouched: number;
    }>;
}
//# sourceMappingURL=scoring-engine.d.ts.map