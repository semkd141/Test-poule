import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { asyncHandler } from "../middleware/async-handler.js";
export type SquadRosterPlayerPublic = {
    player_id: number;
    name: string | null;
    team: string | null;
    pos: string | null;
};
export type ParticipantsHandlers = {
    listParticipants: ReturnType<typeof asyncHandler>;
    listLeaderboard: ReturnType<typeof asyncHandler>;
    findParticipantByEmail: ReturnType<typeof asyncHandler>;
    listApiFootballLeagueTypes: ReturnType<typeof asyncHandler>;
    listPublicCompetitions: ReturnType<typeof asyncHandler>;
    listPublicFixtureMappings: ReturnType<typeof asyncHandler>;
    listMyParticipants: ReturnType<typeof asyncHandler>;
    listMyRegisterableCompetitions: ReturnType<typeof asyncHandler>;
    listMyTeamCompetitions: ReturnType<typeof asyncHandler>;
    listPlayers: ReturnType<typeof asyncHandler>;
    joinCompetition: ReturnType<typeof asyncHandler>;
    createParticipant: ReturnType<typeof asyncHandler>;
    patchParticipantPlayers: ReturnType<typeof asyncHandler>;
    patchParticipant: ReturnType<typeof asyncHandler>;
    deleteParticipant: ReturnType<typeof asyncHandler>;
    postCompetitionFixtureStatistics: ReturnType<typeof asyncHandler>;
    listPublicCompetitionSquadRoster: ReturnType<typeof asyncHandler>;
    listParticipantPlayerRollups: ReturnType<typeof asyncHandler>;
};
export declare function createParticipantsHandlers(gateway: SupabaseGateway, env: Env, log: AppLogger): ParticipantsHandlers;
//# sourceMappingURL=participants.controller.d.ts.map