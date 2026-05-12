import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import type { FixtureSquadMemberInsert } from "./fixture-squad-extract.js";
/** Superadmin dashboard: aggregate DB metrics (see {@link SupabaseGateway.getAdminAnalyticsSnapshot}). */
export type AdminAnalyticsSnapshot = {
    generatedAt: string;
    counts: {
        competitions: number;
        competitionsWithOwner: number;
        competitionsPlatform: number;
        teamsRegistered: number;
        teamsLinkedToAuthUser: number;
        competitionMembers: number;
        invitesTotal: number;
        invitesPending: number;
        invitesAccepted: number;
        fixtureMappings: number;
        matches: number;
        participantScoreEvents: number;
        playerPointsRollupRows: number;
        fixtureSquadMembers: number;
        fixtureSquadFetched: number;
        playerStatisticsRows: number;
        apiFootballLeagueTypes: number;
    };
    topPoolsByTeamCount: Array<{
        competition_id: number;
        team_count: number;
        name: string | null;
        slug: string | null;
        owner_user_id: string | null;
    }>;
    recentTeamRegistrations: Array<{
        id: number;
        competition_id: number;
        email: string | null;
        teamnaam: string | null;
        naam: string | null;
        created_at: string | null;
    }>;
};
/**
 * Encapsulates all HTTP calls to Supabase Auth and PostgREST.
 * Single place for URLs, headers, and error handling.
 */
export declare class SupabaseGateway {
    private readonly env;
    private readonly log;
    private readonly dbBase;
    private readonly authBase;
    /** Lazily created; null if {@link Env.SUPABASE_SERVICE_ROLE_KEY} is unset. */
    private supabaseAdminClient;
    constructor(env: Env, log: AppLogger);
    /** Auth Admin (`auth.admin.*`) via `@supabase/supabase-js` + service role key. */
    private supabaseAdmin;
    /** PostgREST: use service role when set so server reads/writes are not blocked by RLS. User JWT requests keep anon apikey + Bearer user. */
    private serviceHeaders;
    private parseJsonSafe;
    private parseSuccessBody;
    private request;
    sendOtp(email: string): Promise<unknown>;
    signInWithPassword(email: string, password: string): Promise<unknown>;
    /**
     * Uses GoTrue `GET /admin/users?filter=…` (service role). The JS client's `listUsers()`
     * does not pass `filter`, so we keep this HTTP call; {@link adminDeleteUser} uses `auth.admin` instead.
     */
    lookupAuthUserByEmail(email: string): Promise<"exists" | "absent" | "unavailable">;
    /** Removes an Auth user via `supabase.auth.admin.deleteUser` (service role). Logs on failure; does not throw. */
    adminDeleteUser(userId: string): Promise<void>;
    signUpWithPassword(email: string, password: string, redirectTo?: string): Promise<unknown>;
    verifyOtp(email: string, token: string): Promise<unknown>;
    refreshSession(refreshToken: string): Promise<unknown>;
    logout(accessToken: string): Promise<void>;
    getUser(accessToken: string): Promise<unknown>;
    /**
     * Auth user record for public competition “creator” display (service role only).
     * Returns null if service role is not configured or the user does not exist.
     */
    adminGetUserById(userId: string): Promise<Record<string, unknown> | null>;
    /** Count non-config teams per competition (single query). */
    fetchParticipantCountsByCompetition(): Promise<Map<number, number>>;
    listParticipants(): Promise<unknown>;
    getParticipant(id: string): Promise<Record<string, unknown> | null>;
    findParticipantByEmail(email: string): Promise<unknown>;
    /** All team rows for an email (multiple competitions). */
    findAllParticipantsByEmail(email: string): Promise<unknown>;
    findParticipantByEmailAndCompetition(email: string, competitionId: number): Promise<unknown>;
    getCompetitionConfigRow(competitionId: string | number): Promise<Record<string, unknown> | null>;
    listWkSpelers(): Promise<unknown>;
    listParticipantsByCompetition(competitionId: number): Promise<unknown>;
    /**
     * All pool teams that picked this API-Football player for the competition's league + season
     * (used after fixture goal stats sync to increment rollups in one query).
     */
    listPlayerRollupsByCompetitionLeagueSeasonPlayer(competitionId: number, leagueId: number, season: number, playerId: number): Promise<unknown>;
    listPlayerRollupsByTeamLeagueSeason(teamId: number, leagueId: number, season: number, orderBy?: string): Promise<unknown>;
    /** All squad lines for a league+season (multiple fixtures); caller dedupes by `player_id`. */
    listFixtureSquadMembersByLeagueSeason(leagueId: number, season: number): Promise<unknown>;
    /** Distinct `team` (lineup side) labels for a player in a league+season (from fixture squads). */
    listFixtureSquadTeamsForPlayer(playerId: number, leagueId: number, season: number): Promise<string[]>;
    deletePlayerRollupsByTeamLeagueSeason(teamId: number, leagueId: number, season: number): Promise<void>;
    insertPlayerRollupsBatch(rows: Array<{
        competition_id: number;
        team_id: number;
        api_football_league_id: number;
        season: number;
        player_id: number;
        pos: string | null;
        is_captain: boolean;
        points: number;
    }>): Promise<void>;
    patchPlayerRollupById(id: string, body: {
        points: number;
    }): Promise<void>;
    /** Recompute `teams.total_points` as the sum of rollup `points` for this team (all league/season rows). */
    recomputeTeamTotalPointsFromRollups(teamId: string): Promise<void>;
    patchTeamTotalPoints(teamId: string, totalPoints: number): Promise<unknown>;
    private metadataApiFootballSeason;
    private metadataApiFootballLeague;
    /**
     * Resolve API-Football league id + season for fixture_mappings (shared rows for that tournament).
     */
    getFixtureMappingScopeForCompetition(comp: Record<string, unknown>): {
        leagueId: number;
        season: number;
    } | null;
    /** True if any fixture_mapping rows exist for this league + season (shared across pools). */
    fixtureMappingsExistForLeagueSeason(leagueId: number, season: number): Promise<boolean>;
    listFixtureMappingsByLeagueSeason(leagueId: number, season: number): Promise<unknown>;
    /** List mappings for a pool by resolving its competition row to API league + season. */
    listFixtureMappings(competitionId: number): Promise<unknown>;
    getFixtureMappingById(id: string): Promise<Record<string, unknown> | null>;
    patchFixtureMapping(id: string, body: {
        api_fixture_id?: number | null;
    }): Promise<unknown>;
    /**
     * Upsert many fixture_mappings rows in chunks (composite key api_football_league_id + season + local_key).
     */
    upsertFixtureMappingsBatch(rows: Array<{
        api_football_league_id: number;
        season: number;
        local_key: string;
        api_fixture_id: number | null;
        stage: string;
        kickoff_at: string | null;
        team_1: string | null;
        team_2: string | null;
        location: string | null;
    }>): Promise<void>;
    upsertMatch(body: Record<string, unknown>): Promise<unknown>;
    getMatchByCompetitionAndExternalFixture(competitionId: number, externalFixtureId: number): Promise<Record<string, unknown> | null>;
    listPlayerStatisticsByFixture(fixtureId: number): Promise<unknown>;
    deletePlayerStatisticsByFixture(fixtureId: number): Promise<void>;
    insertPlayerStatisticsBatch(rows: Array<{
        fixture_id: number;
        land: string;
        speler_naam: string;
        player_id: number | null;
        punten: number;
    }>): Promise<void>;
    listScorableMatches(competitionId: number): Promise<unknown>;
    insertScoreEventIfMissing(participantId: number, matchId: number, eventKey: string, deltaPoints: number): Promise<boolean>;
    getCompetitionBySlug(slug: string): Promise<Record<string, unknown> | null>;
    getCompetitionById(id: string): Promise<Record<string, unknown> | null>;
    listCompetitionsByOwner(ownerUserId: string): Promise<unknown>;
    /** Competition ids where the user has a `competition_members` row (joined / invited). */
    listCompetitionMemberIdsForUser(userId: string): Promise<number[]>;
    listCompetitionsByIds(ids: number[]): Promise<unknown>;
    listCompetitions(): Promise<unknown>;
    /** Public lookup rows for league-type dropdown (same as PostgREST anon SELECT). */
    listApiFootballLeagueLookup(): Promise<{
        league_type: string;
        league_id: number;
    }[]>;
    getApiFootballLeagueIdByType(leagueType: string): Promise<number | null>;
    createCompetition(body: Record<string, unknown>): Promise<unknown>;
    patchCompetition(id: string, body: Record<string, unknown>): Promise<unknown>;
    deleteCompetition(id: string): Promise<void>;
    createParticipant(body: unknown): Promise<unknown>;
    patchParticipant(id: string, body: unknown): Promise<unknown>;
    /** @deprecated Use rollup + recomputeTeamTotalPointsFromRollups; kept for scoring sync compatibility. */
    patchParticipantAggregates(id: string, totalPoints: number, _attackerGoals: number): Promise<unknown>;
    deleteParticipant(id: string): Promise<void>;
    hashInviteToken(plainToken: string): string;
    createInviteSecret(): {
        plainToken: string;
        tokenHash: string;
    };
    deletePendingInvitesForEmail(competitionId: number, email: string): Promise<void>;
    insertCompetitionInvite(row: {
        competition_id: number;
        email: string;
        token_hash: string;
        invited_by: string;
        expires_at: string;
    }): Promise<unknown>;
    getInviteByTokenHash(tokenHash: string): Promise<Record<string, unknown> | null>;
    listCompetitionInvites(competitionId: number): Promise<unknown>;
    patchCompetitionInvite(id: string, body: Record<string, unknown>): Promise<unknown>;
    isCompetitionMember(competitionId: number, userId: string): Promise<boolean>;
    insertCompetitionMember(competitionId: number, userId: string, inviteId: number | null): Promise<boolean>;
    hasFixtureSquadMembersForFixture(fixtureId: number): Promise<boolean>;
    /** Any squad row for this API-Football league + season + lineup side name (`team`). */
    existsFixtureSquadLeagueSeasonTeam(leagueId: number, season: number, team: string): Promise<boolean>;
    hasFixtureSquadFetched(fixtureId: number): Promise<boolean>;
    insertFixtureSquadFetchedMarker(fixtureId: number): Promise<void>;
    insertFixtureSquadMembers(rows: FixtureSquadMemberInsert[]): Promise<void>;
    /**
     * PostgREST exact row count (`HEAD` + `Prefer: count=exact`).
     * Parses total from the `Content-Range` header (format ends with slash + row count).
     * `query` is the path after `/rest/v1/`, e.g. `teams?select=id&email=not.eq.__config__`.
     */
    postgrestCountExact(query: string): Promise<number>;
    /** Aggregated metrics for the superadmin Analytics panel (internal API only). */
    getAdminAnalyticsSnapshot(): Promise<AdminAnalyticsSnapshot>;
}
//# sourceMappingURL=supabase-gateway.d.ts.map