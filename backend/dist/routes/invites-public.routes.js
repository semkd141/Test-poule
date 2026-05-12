import { Router } from "express";
import { HttpError } from "../shared/http-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireBearerSupabaseJwt } from "../middleware/supabase-auth.js";
import { normEmail } from "../participant/participant-access.js";
import { z } from "zod";
const acceptBodySchema = z.object({
    token: z.string().min(16, "token required"),
});
function bearerToken(req) {
    return String(req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}
function requireSub(req) {
    const s = req.supabaseUser?.sub;
    if (!s || typeof s !== "string")
        throw new HttpError(401, "Not authenticated");
    return s.trim();
}
function emailFromAuthUser(data) {
    if (!data || typeof data !== "object")
        return null;
    const d = data;
    const nested = d.user;
    if (nested && typeof nested === "object") {
        const e = nested.email;
        if (typeof e === "string" && e.trim())
            return normEmail(e);
    }
    const top = d.email;
    if (typeof top === "string" && top.trim())
        return normEmail(top);
    return null;
}
export function createInvitesPublicRouter(gateway, env) {
    const router = Router();
    const requireAuth = requireBearerSupabaseJwt(env);
    router.get("/preview", asyncHandler(async (req, res) => {
        const token = String(req.query.token ?? "").trim();
        if (!token)
            throw new HttpError(400, "token query required");
        const hash = gateway.hashInviteToken(token);
        const inv = await gateway.getInviteByTokenHash(hash);
        if (!inv)
            throw new HttpError(404, "Invitation not found");
        const cid = Number(inv.competition_id);
        if (!Number.isFinite(cid))
            throw new HttpError(500, "Invalid invite");
        const comp = await gateway.getCompetitionById(String(cid));
        if (!comp)
            throw new HttpError(404, "Competition not found");
        const expiresAt = inv.expires_at ? String(inv.expires_at) : "";
        const expMs = expiresAt ? new Date(expiresAt).getTime() : 0;
        if (expMs && Date.now() > expMs)
            throw new HttpError(410, "Invitation expired");
        if (inv.accepted_at) {
            res.json({
                competitionId: cid,
                name: String(comp.name ?? ""),
                slug: String(comp.slug ?? ""),
                alreadyUsed: true,
            });
            return;
        }
        res.json({
            competitionId: cid,
            name: String(comp.name ?? ""),
            slug: String(comp.slug ?? ""),
            alreadyUsed: false,
        });
    }));
    router.post("/accept", requireAuth, asyncHandler(async (req, res) => {
        const parsed = acceptBodySchema.safeParse(req.body);
        if (!parsed.success)
            throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
        const token = parsed.data.token.trim();
        const hash = gateway.hashInviteToken(token);
        const inv = await gateway.getInviteByTokenHash(hash);
        if (!inv)
            throw new HttpError(404, "Invitation not found");
        const cid = Number(inv.competition_id);
        const inviteId = Number(inv.id);
        if (!Number.isFinite(cid) || !Number.isFinite(inviteId))
            throw new HttpError(500, "Invalid invite");
        const exp = inv.expires_at ? new Date(String(inv.expires_at)).getTime() : 0;
        if (exp && Date.now() > exp)
            throw new HttpError(410, "Invitation expired");
        const accessToken = bearerToken(req);
        const jwtMail = req.supabaseUser?.email;
        let userEmail = typeof jwtMail === "string" && jwtMail.trim() ? normEmail(jwtMail) : null;
        if (!userEmail) {
            userEmail = await emailFromAccessToken(gateway, accessToken);
        }
        if (!userEmail)
            throw new HttpError(400, "Could not read your account email; try signing in again.");
        const expected = normEmail(String(inv.email ?? ""));
        if (userEmail !== expected) {
            throw new HttpError(403, "Sign in with the email address this invitation was sent to.");
        }
        const sub = requireSub(req);
        const comp = await gateway.getCompetitionById(String(cid));
        const competitionName = comp ? String(comp.name ?? "") : "";
        const slug = comp ? String(comp.slug ?? "") : "";
        const alreadyMember = await gateway.isCompetitionMember(cid, sub);
        if (alreadyMember) {
            res.json({
                ok: true,
                alreadyMember: true,
                competitionId: cid,
                competitionName,
                slug,
            });
            return;
        }
        if (inv.accepted_at != null) {
            if (String(inv.accepted_user_id ?? "") !== sub) {
                throw new HttpError(403, "This invitation was already used.");
            }
            res.json({
                ok: true,
                alreadyMember: true,
                competitionId: cid,
                competitionName,
                slug,
            });
            return;
        }
        const inserted = await gateway.insertCompetitionMember(cid, sub, inviteId);
        if (!inserted) {
            if (await gateway.isCompetitionMember(cid, sub)) {
                res.json({ ok: true, alreadyMember: true, competitionId: cid, competitionName, slug });
                return;
            }
            throw new HttpError(409, "Could not record membership");
        }
        await gateway.patchCompetitionInvite(String(inviteId), {
            accepted_at: new Date().toISOString(),
            accepted_user_id: sub,
        });
        res.json({
            ok: true,
            alreadyMember: false,
            competitionId: cid,
            competitionName,
            slug,
        });
    }));
    return router;
}
async function emailFromAccessToken(gateway, accessToken) {
    const u = await gateway.getUser(accessToken);
    return emailFromAuthUser(u);
}
//# sourceMappingURL=invites-public.routes.js.map