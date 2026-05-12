export function normEmail(e) {
    return String(e ?? "")
        .trim()
        .toLowerCase();
}
/**
 * Ownership: bound user_id matches JWT sub,
 * OR legacy row still unbound (email match so we can migrate user_id on write).
 */
export function canMutateParticipantRow(row, jwt) {
    if (!jwt?.sub)
        return false;
    const rowUid = row.user_id ? String(row.user_id) : "";
    const je = jwt.email !== undefined ? normEmail(jwt.email) : "";
    if (rowUid && rowUid === jwt.sub)
        return true;
    const re = normEmail(row.email);
    if (!rowUid && re && je && re === je)
        return true;
    return false;
}
/** Whether we may stamp user_id onto the row during create (same email claim as registration email). */
export function canAttachUserOnCreate(registrationEmail, jwt) {
    if (!jwt?.sub)
        return false;
    const re = normEmail(registrationEmail);
    const je = jwt.email !== undefined ? normEmail(jwt.email) : "";
    return Boolean(re && je && re === je);
}
//# sourceMappingURL=participant-access.js.map