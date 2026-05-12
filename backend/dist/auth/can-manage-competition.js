/** Pool creator only (`competitions.owner_user_id`). Platform-wide changes use internal/admin routes. */
export function canManageCompetition(req, _env, competitionRow) {
    const uid = String(req.supabaseUser?.sub ?? "");
    const o = competitionRow.owner_user_id;
    return Boolean(uid && o != null && String(o) === uid);
}
//# sourceMappingURL=can-manage-competition.js.map