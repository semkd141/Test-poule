import type { Request, Response } from "express";
import type { Env } from "../config/env.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { HttpError } from "../shared/http-error.js";
import { z } from "zod";
import {
  canAttachUserOnCreate,
  canMutateParticipantRow,
  type DeelnemerRow,
} from "../participant/participant-access.js";
import { isPastCompetitionDeadline } from "../participant/competition-deadline.js";

const emailQuerySchema = z.object({
  email: z.string().min(1, "email query required"),
});

const idParamSchema = z.object({
  id: z.string().min(1, "id required"),
});

const patchPlayersSchema = z.object({
  spelers: z.unknown(),
});

function asObjectBody(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

function mergeUserStamp(req: Request): Record<string, unknown> {
  const row = req.participantRow as DeelnemerRow | undefined;
  const jwt = req.supabaseUser;
  if (!row || !jwt?.sub) return {};
  if (!canMutateParticipantRow(row, jwt)) return {};
  return { user_id: jwt.sub };
}

function sanitizePatchBody(req: Request, base: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  delete out.user_id;
  return { ...out, ...mergeUserStamp(req) };
}

export type ParticipantsHandlers = {
  listParticipants: ReturnType<typeof asyncHandler>;
  findParticipantByEmail: ReturnType<typeof asyncHandler>;
  listPlayers: ReturnType<typeof asyncHandler>;
  createParticipant: ReturnType<typeof asyncHandler>;
  patchParticipantPlayers: ReturnType<typeof asyncHandler>;
  patchParticipant: ReturnType<typeof asyncHandler>;
  deleteParticipant: ReturnType<typeof asyncHandler>;
};

function isAdminBySecret(req: Request, env: Env): boolean {
  return Boolean(env.ADMIN_API_SECRET && req.get("x-admin-secret") === env.ADMIN_API_SECRET);
}

function asRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown>[];
}

function parseSpelers(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((x) => x && typeof x === "object") as Record<string, unknown>[]
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function totalPointsFromSpelers(raw: unknown): number {
  return parseSpelers(raw).reduce((sum, sp) => sum + (Number(sp.punten) || 0), 0);
}

function redactForPublicSummary(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    naam: row.naam,
    teamnaam: row.teamnaam,
    systeem: row.systeem,
    competition_id: row.competition_id,
    spelers: [],
    totalPoints: totalPointsFromSpelers(row.spelers),
    hiddenBeforeDeadline: true,
  };
}

function filterRowsBeforeDeadline(rows: Record<string, unknown>[], req: Request): Record<string, unknown>[] {
  const jwt = req.supabaseUser;
  return rows.map((row) => {
    if (row.email === "__config__") return row;
    if (canMutateParticipantRow(row as DeelnemerRow, jwt)) return row;
    return redactForPublicSummary(row);
  });
}

export function createParticipantsHandlers(gateway: SupabaseGateway, env: Env): ParticipantsHandlers {
  return {
    listParticipants: asyncHandler(async (req: Request, res: Response) => {
      const data = await gateway.listParticipants();
      const rows = asRows(data);
      const cfgRow = rows.find((r) => r.email === "__config__") ?? null;
      const beforeDeadline = !isPastCompetitionDeadline(cfgRow);
      if (beforeDeadline && !isAdminBySecret(req, env)) {
        res.json(filterRowsBeforeDeadline(rows, req));
        return;
      }
      res.json(rows);
    }),

    findParticipantByEmail: asyncHandler(async (req: Request, res: Response) => {
      const parsed = emailQuerySchema.safeParse({ email: req.query.email });
      if (!parsed.success) throw new HttpError(400, "email query parameter required");
      const data = await gateway.findParticipantByEmail(parsed.data.email);
      const rows = asRows(data);
      const row = rows[0];
      if (!row) {
        res.json([]);
        return;
      }
      const competitionId = row.competition_id;
      if (competitionId !== undefined && competitionId !== null) {
        const cfgRow = await gateway.getCompetitionConfigRow(String(competitionId));
        const beforeDeadline = !isPastCompetitionDeadline(cfgRow);
        if (beforeDeadline && !isAdminBySecret(req, env)) {
          if (!canMutateParticipantRow(row as DeelnemerRow, req.supabaseUser)) {
            throw new HttpError(403, "Not allowed to read another user's team before deadline");
          }
        }
      }
      res.json([row]);
    }),

    listPlayers: asyncHandler(async (_req: Request, res: Response) => {
      const data = await gateway.listWkSpelers();
      res.json(data);
    }),

    createParticipant: asyncHandler(async (req: Request, res: Response) => {
      const body = asObjectBody(req.body);
      delete body.user_id;
      const jwt = req.supabaseUser;
      const adminOk = isAdminBySecret(req, env);
      if (!adminOk) {
        if (!jwt?.sub) throw new HttpError(401, "Authorization Bearer token required");
        if (!canAttachUserOnCreate(body.email, jwt)) {
          throw new HttpError(403, "Authenticated email must match registration email");
        }
        body.user_id = jwt.sub;
      }
      const dup = asRows(await gateway.findParticipantByEmail(String(body.email ?? "")));
      if (dup.length > 0) throw new HttpError(409, "This email is already registered");
      const data = await gateway.createParticipant(body);
      res.json(data);
    }),

    patchParticipantPlayers: asyncHandler(async (req: Request, res: Response) => {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) throw new HttpError(400, "Invalid id");

      const body = patchPlayersSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "spelers field required");

      const payload = sanitizePatchBody(req, { spelers: body.data.spelers });
      const data = await gateway.patchParticipantPlayers(params.data.id, payload);
      res.json(data);
    }),

    patchParticipant: asyncHandler(async (req: Request, res: Response) => {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) throw new HttpError(400, "Invalid id");

      const base = asObjectBody(req.body);
      const merged = sanitizePatchBody(req, base);
      const data = await gateway.patchParticipant(params.data.id, merged);
      res.json(data);
    }),

    deleteParticipant: asyncHandler(async (req: Request, res: Response) => {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) throw new HttpError(400, "Invalid id");

      await gateway.deleteParticipant(params.data.id);
      res.status(204).send();
    }),
  };
}
