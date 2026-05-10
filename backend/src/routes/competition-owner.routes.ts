import { Router } from "express";
import type { Request } from "express";
import type { Env } from "../config/env.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { HttpError } from "../shared/http-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { isPlatformOperator } from "../auth/platform-operator.js";
import { normEmail } from "../participant/participant-access.js";
import { TransactionalEmailService } from "../services/transactional-email.js";
import { z } from "zod";

function ownerSub(req: Request): string {
  const s = req.supabaseUser?.sub;
  if (!s || typeof s !== "string") throw new HttpError(401, "Not authenticated");
  return s.trim();
}

function canManageCompetition(req: Request, env: Env, row: Record<string, unknown>): boolean {
  if (isPlatformOperator(req, env)) return true;
  const uid = String(req.supabaseUser?.sub ?? "");
  const o = row.owner_user_id;
  return Boolean(uid && o != null && String(o) === uid);
}

const competitionCreateSchema = z.object({
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug: lowercase letters, digits, hyphens only"),
  name: z.string().min(2),
  season_label: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().optional()),
  starts_at: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().datetime().optional()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const competitionPatchSchema = z.object({
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug: lowercase letters, digits, hyphens only")
    .optional(),
  name: z.string().min(2).optional(),
  season_label: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  starts_at: z.preprocess((v) => (v === "" ? null : v), z.string().datetime().nullable().optional()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Full replace of editable fields (PUT): all keys required; use null to clear optionals. */
const competitionPutSchema = z.object({
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug: lowercase letters, digits, hyphens only"),
  name: z.string().min(2),
  season_label: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.union([z.string(), z.null()]),
  ),
  starts_at: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.union([z.string().datetime(), z.null()]),
  ),
  metadata: z.record(z.string(), z.unknown()),
});

const mappingPatchSchema = z.object({
  api_fixture_id: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.coerce.number().int().positive().nullable(),
  ),
});

const invitePostSchema = z.object({
  email: z.string().email(),
});

async function requesterEmail(req: Request, gateway: SupabaseGateway): Promise<string | null> {
  const j = req.supabaseUser?.email;
  if (typeof j === "string" && j.trim()) return normEmail(j);
  const tok = String(req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!tok) return null;
  const u = await gateway.getUser(tok);
  if (!u || typeof u !== "object") return null;
  const d = u as Record<string, unknown>;
  const nested = d.user;
  if (nested && typeof nested === "object") {
    const e = (nested as Record<string, unknown>).email;
    if (typeof e === "string" && e.trim()) return normEmail(e);
  }
  const top = d.email;
  if (typeof top === "string" && top.trim()) return normEmail(top);
  return null;
}

export function createCompetitionOwnerRouter(gateway: SupabaseGateway, env: Env): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const sub = ownerSub(req);
      if (isPlatformOperator(req, env)) {
        const raw = await gateway.listCompetitions();
        res.json(Array.isArray(raw) ? raw : []);
        return;
      }
      const out = await gateway.listCompetitionsByOwner(sub);
      res.json(Array.isArray(out) ? out : []);
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const sub = ownerSub(req);
      const parsed = competitionCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const body = {
        ...parsed.data,
        slug: parsed.data.slug.trim().toLowerCase(),
        owner_user_id: sub,
      };
      const out = await gateway.createCompetition(body);
      res.status(201).json(out);
    }),
  );

  router.get(
    "/:competitionId/fixture-mappings",
    asyncHandler(async (req, res) => {
      const id = String(req.params.competitionId ?? "").trim();
      if (!id) throw new HttpError(400, "competition id required");
      const row = await gateway.getCompetitionById(id);
      if (!row) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, row)) throw new HttpError(403, "Forbidden");
      const competitionId = Number(row.id);
      if (!Number.isFinite(competitionId)) throw new HttpError(500, "Invalid competition id");
      const out = await gateway.listFixtureMappings(competitionId);
      res.json(Array.isArray(out) ? out : []);
    }),
  );

  router.patch(
    "/:competitionId/fixture-mappings/:mappingId",
    asyncHandler(async (req, res) => {
      const cid = String(req.params.competitionId ?? "").trim();
      const mid = String(req.params.mappingId ?? "").trim();
      if (!cid || !mid) throw new HttpError(400, "competition id and mapping id required");
      const comp = await gateway.getCompetitionById(cid);
      if (!comp) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, comp)) throw new HttpError(403, "Forbidden");
      const compNum = Number(comp.id);
      const mapRow = await gateway.getFixtureMappingById(mid);
      if (!mapRow) throw new HttpError(404, "Fixture mapping not found");
      if (Number(mapRow.competition_id) !== compNum) throw new HttpError(400, "Mapping does not belong to this competition");
      const parsed = mappingPatchSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const out = await gateway.patchFixtureMapping(mid, parsed.data);
      res.json(out);
    }),
  );

  router.get(
    "/:competitionId/participants",
    asyncHandler(async (req, res) => {
      const id = String(req.params.competitionId ?? "").trim();
      if (!id) throw new HttpError(400, "competition id required");
      const row = await gateway.getCompetitionById(id);
      if (!row) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, row)) throw new HttpError(403, "Forbidden");
      const competitionId = Number(row.id);
      if (!Number.isFinite(competitionId)) throw new HttpError(500, "Invalid competition id");
      const out = await gateway.listParticipantsByCompetition(competitionId);
      res.json(Array.isArray(out) ? out : []);
    }),
  );

  router.get(
    "/:competitionId/invites",
    asyncHandler(async (req, res) => {
      const id = String(req.params.competitionId ?? "").trim();
      if (!id) throw new HttpError(400, "competition id required");
      const row = await gateway.getCompetitionById(id);
      if (!row) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, row)) throw new HttpError(403, "Forbidden");
      const competitionId = Number(row.id);
      if (!Number.isFinite(competitionId)) throw new HttpError(500, "Invalid competition id");
      if (row.owner_user_id == null) {
        res.json([]);
        return;
      }
      const out = await gateway.listCompetitionInvites(competitionId);
      res.json(Array.isArray(out) ? out : []);
    }),
  );

  router.post(
    "/:competitionId/invites",
    asyncHandler(async (req, res) => {
      const id = String(req.params.competitionId ?? "").trim();
      const parsed = invitePostSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const row = await gateway.getCompetitionById(id);
      if (!row) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, row)) throw new HttpError(403, "Forbidden");
      if (row.owner_user_id == null) {
        throw new HttpError(400, "Email invites are only available for pools created in the Competition tab");
      }
      const competitionId = Number(row.id);
      if (!Number.isFinite(competitionId)) throw new HttpError(500, "Invalid competition id");
      const inviteEmail = normEmail(parsed.data.email);
      const ownerEmail = await requesterEmail(req, gateway);
      if (!ownerEmail) throw new HttpError(400, "Your account email is required to send invitations");
      if (inviteEmail === ownerEmail) throw new HttpError(400, "You cannot invite yourself");

      await gateway.deletePendingInvitesForEmail(competitionId, inviteEmail);
      const { plainToken, tokenHash } = gateway.createInviteSecret();
      const expires = new Date();
      expires.setDate(expires.getDate() + 14);
      const sub = ownerSub(req);
      const inserted = await gateway.insertCompetitionInvite({
        competition_id: competitionId,
        email: inviteEmail,
        token_hash: tokenHash,
        invited_by: sub,
        expires_at: expires.toISOString(),
      });
      const insRow = Array.isArray(inserted) ? inserted[0] : inserted;
      const base = (env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
      const inviteUrl = `${base}/?invite=${encodeURIComponent(plainToken)}`;
      const mailer = new TransactionalEmailService(env);
      const compName = String(row.name ?? "Competition");
      const send = await mailer.sendCompetitionInvite(inviteEmail, compName, inviteUrl);
      res.status(201).json({
        ok: true,
        id: insRow && typeof insRow === "object" && insRow !== null && "id" in insRow ? (insRow as { id: unknown }).id : undefined,
        email: inviteEmail,
        expires_at: expires.toISOString(),
        emailed: send.sent,
        emailReason: send.reason,
        inviteUrl,
      });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const row = await gateway.getCompetitionById(id);
      if (!row) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, row)) throw new HttpError(403, "Forbidden");
      res.json(row);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const existing = await gateway.getCompetitionById(id);
      if (!existing) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, existing)) throw new HttpError(403, "Forbidden");
      const parsed = competitionPatchSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const bodyRaw = parsed.data;
      if (!Object.keys(bodyRaw).length) throw new HttpError(400, "No fields to update");
      const body =
        bodyRaw.slug !== undefined ? { ...bodyRaw, slug: bodyRaw.slug.trim().toLowerCase() } : bodyRaw;
      const out = await gateway.patchCompetition(id, body);
      res.json(out);
    }),
  );

  router.put(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const existing = await gateway.getCompetitionById(id);
      if (!existing) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, existing)) throw new HttpError(403, "Forbidden");
      const parsed = competitionPutSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const body = {
        ...parsed.data,
        slug: parsed.data.slug.trim().toLowerCase(),
      };
      const out = await gateway.patchCompetition(id, body);
      res.json(out);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const existing = await gateway.getCompetitionById(id);
      if (!existing) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, existing)) throw new HttpError(403, "Forbidden");
      await gateway.deleteCompetition(id);
      res.status(204).send();
    }),
  );

  return router;
}
