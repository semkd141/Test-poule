import type { SupabaseGateway } from "./supabase-gateway.js";

type MatchRow = {
  id: number;
  competition_id: number;
  status: string;
  home_team: string;
  away_team: string;
  home_goals: number | null;
  away_goals: number | null;
  round: string | null;
};

type ParticipantRow = {
  id: number;
  spelers: unknown;
};

type Pick = {
  land?: string;
  punten?: number;
  aanvoerder?: boolean;
  positie?: string;
};

const BASE_DELTA = 3;

function parsePicks(raw: unknown): Pick[] {
  if (Array.isArray(raw)) return raw as Pick[];
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? (p as Pick[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function winnerTeam(m: MatchRow): string | null {
  if (m.home_goals === null || m.away_goals === null) return null;
  if (m.home_goals === m.away_goals) return null;
  return m.home_goals > m.away_goals ? m.home_team : m.away_team;
}

export class ScoringEngine {
  constructor(private readonly gateway: SupabaseGateway) {}

  /**
   * Idempotent scoring for matches with status FT/AET/PEN.
   * Uses participant_score_events unique keys to avoid duplicate scoring.
   */
  async scoreCompetition(competitionId: number): Promise<{ matches: number; participantsTouched: number }> {
    const matches = (await this.gateway.listScorableMatches(competitionId)) as MatchRow[];
    const participants = (await this.gateway.listParticipantsByCompetition(competitionId)) as ParticipantRow[];
    let touched = 0;

    for (const m of matches) {
      const winner = winnerTeam(m);
      if (!winner) continue;

      for (const p of participants) {
        const picks = parsePicks(p.spelers);
        if (!picks.length) continue;
        let changed = false;

        for (let i = 0; i < picks.length; i += 1) {
          const pick = picks[i];
          if (!pick || !pick.land || pick.land !== winner) continue;
          const baseKey = `winner:${m.id}:${i}:${winner}`;
          const canApply = await this.gateway.insertScoreEventIfMissing(p.id, m.id, baseKey, BASE_DELTA);
          if (canApply) {
            pick.punten = (Number(pick.punten) || 0) + BASE_DELTA;
            changed = true;
          }
          if (pick.aanvoerder) {
            const capKey = `captain:${m.id}:${i}:${winner}`;
            const capApply = await this.gateway.insertScoreEventIfMissing(p.id, m.id, capKey, BASE_DELTA);
            if (capApply) {
              pick.punten = (Number(pick.punten) || 0) + BASE_DELTA;
              changed = true;
            }
          }
        }

        // Champion bonus: final winner gives +3 to coach pick on same winning country.
        const isFinal = String(m.round ?? "").toLowerCase().includes("final");
        if (isFinal) {
          for (let i = 0; i < picks.length; i += 1) {
            const pick = picks[i];
            if (pick?.positie !== "coach" || pick.land !== winner) continue;
            const champKey = `champion:${m.id}:${i}:${winner}`;
            const champApply = await this.gateway.insertScoreEventIfMissing(p.id, m.id, champKey, BASE_DELTA);
            if (champApply) {
              pick.punten = (Number(pick.punten) || 0) + BASE_DELTA;
              changed = true;
            }
          }
        }

        if (changed) {
          touched += 1;
          await this.gateway.patchParticipantPlayers(String(p.id), { spelers: JSON.stringify(picks) });
        }
      }
    }

    return { matches: matches.length, participantsTouched: touched };
  }
}
