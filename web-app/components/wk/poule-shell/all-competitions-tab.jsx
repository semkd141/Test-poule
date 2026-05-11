"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "../poule-context.jsx";
import {
  authGetValidSession,
  joinCompetition,
  listPublicCompetitions,
  queueRegisterForCompetition,
} from "../../../lib/wk/api-client";

function fmtWhen(iso, tz) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { timeZone: tz || undefined, dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function registrationLooksOpen(c) {
  if (typeof c.registration_open === "boolean") return c.registration_open;
  if (c.registration_deadline) {
    try {
      return new Date(c.registration_deadline).getTime() > Date.now();
    } catch {
      return false;
    }
  }
  return true;
}

export function AllCompetitionsTab() {
  const { t, setTab, tz } = useApp();
  const tc = t.allCompetitionsTab || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joinBusyId, setJoinBusyId] = useState(null);
  const [joinErrById, setJoinErrById] = useState({});

  const load = useCallback(async function() {
    setLoading(true);
    try {
      const data = await listPublicCompetitions();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function() {
    load();
  }, [load]);

  function creatorLine(c) {
    if (c.creator && (c.creator.full_name || c.creator.email)) {
      var parts = [];
      if (c.creator.full_name) parts.push(c.creator.full_name);
      if (c.creator.email) parts.push("(" + c.creator.email + ")");
      return parts.join(" ");
    }
    if (c.owner_user_id) return (tc.ownerIdOnly || "Organizer account") + ": " + String(c.owner_user_id);
    return tc.platformPool || "Platform / seeded pool";
  }

  if (loading) return <div className="spinner"></div>;

  return (
    <div className="card">
      <div className="card-title">{tc.title || "All competitions"}</div>
      <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 18, lineHeight: 1.55 }}>
        {tc.intro ||
          "Every public pool, its registration deadline, and who created it. When registration is still open, you can go straight to sign-up for that pool."}
      </p>
      {rows.length === 0 ? (
        <div className="empty-state" style={{ color: "var(--fg-muted)" }}>
          {tc.empty || "No competitions found."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rows.map(function(c) {
            var open = registrationLooksOpen(c);
            return (
              <div
                key={String(c.id)}
                style={{
                  padding: "14px 16px",
                  background: "var(--bg-2)",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 16 }}>{c.name || c.slug || "—"}</strong>
                    <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 4 }}>
                      {(tc.slugLabel || "Slug") + ": " + (c.slug || "—")}
                      {c.season_label ? " · " + c.season_label : ""}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: open ? "rgba(34,197,94,0.15)" : "var(--bg-3)",
                      color: open ? "#22c55e" : "var(--fg-muted)",
                      border: "1px solid " + (open ? "rgba(34,197,94,0.4)" : "var(--border)"),
                    }}
                  >
                    {open ? tc.openBadge || "Registration open" : tc.closedBadge || "Closed"}
                  </span>
                </div>
                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(120px, 160px) 1fr",
                    gap: "6px 12px",
                    fontSize: 13,
                    margin: 0,
                    marginBottom: 10,
                  }}
                >
                  <dt style={{ color: "var(--fg-muted)" }}>{tc.organizer || "Organizer"}</dt>
                  <dd style={{ margin: 0, wordBreak: "break-word" }}>{creatorLine(c)}</dd>
                  <dt style={{ color: "var(--fg-muted)" }}>{tc.teams || "Teams registered"}</dt>
                  <dd style={{ margin: 0 }}>{c.team_count != null ? String(c.team_count) : "—"}</dd>
                  <dt style={{ color: "var(--fg-muted)" }}>{tc.deadline || "Registration deadline"}</dt>
                  <dd style={{ margin: 0 }}>
                    <strong>{c.registration_deadline_label || fmtWhen(c.registration_deadline, tz)}</strong>
                    {c.registration_deadline ? (
                      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
                        {fmtWhen(c.registration_deadline, tz)}
                      </div>
                    ) : null}
                  </dd>
                  <dt style={{ color: "var(--fg-muted)" }}>{tc.starts || "Competition starts"}</dt>
                  <dd style={{ margin: 0 }}>{fmtWhen(c.starts_at, tz)}</dd>
                  <dt style={{ color: "var(--fg-muted)" }}>{tc.created || "Pool created"}</dt>
                  <dd style={{ margin: 0 }}>{fmtWhen(c.created_at, tz)}</dd>
                  <dt style={{ color: "var(--fg-muted)" }}>{tc.poolId || "Pool id"}</dt>
                  <dd style={{ margin: 0 }}>
                    <code>{c.id}</code>
                  </dd>
                </dl>
                {/* {c.metadata && typeof c.metadata === "object" && Object.keys(c.metadata).length > 0 ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 4 }}>
                      {tc.metadata || "Metadata"}
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        padding: 10,
                        background: "var(--bg-3)",
                        borderRadius: 8,
                        fontSize: 11,
                        overflow: "auto",
                        maxHeight: 160,
                      }}
                    >
                      {JSON.stringify(c.metadata, null, 2)}
                    </pre>
                  </div>
                ) : null} */}
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {joinErrById[c.id] ? (
                    <div style={{ fontSize: 12, color: "var(--orange)", maxWidth: 480 }}>
                      {String(joinErrById[c.id])}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  {open ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={joinBusyId != null && joinBusyId === c.id}
                      onClick={async function() {
                        var idNum = Number(c.id);
                        setJoinErrById(function(prev) {
                          var next = Object.assign({}, prev);
                          delete next[c.id];
                          return next;
                        });
                        queueRegisterForCompetition({
                          id: idNum,
                          name: String(c.name || c.slug || "Pool"),
                          slug: typeof c.slug === "string" ? c.slug : undefined,
                          registration_deadline:
                            typeof c.registration_deadline === "string" ? c.registration_deadline : undefined,
                          registration_open:
                            typeof c.registration_open === "boolean" ? c.registration_open : undefined,
                        });
                        var sess = await authGetValidSession();
                        if (!sess || !sess.access_token) {
                          setTab("register");
                          return;
                        }
                        setJoinBusyId(idNum);
                        try {
                          await joinCompetition(idNum);
                          setTab("register");
                        } catch (e) {
                          setJoinErrById(function(prev) {
                            return Object.assign({}, prev, {
                              [c.id]: String(e && e.message ? e.message : e),
                            });
                          });
                        } finally {
                          setJoinBusyId(null);
                        }
                      }}
                    >
                      {joinBusyId === c.id
                        ? tc.joining || "Joining…"
                        : tc.registerCta || "Register for this competition"}
                    </button>
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                      {tc.closedHint || "Registration is closed for this pool — you can still browse details."}
                    </span>
                  )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
