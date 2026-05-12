"use client";

import React, { useState, useEffect, useCallback } from "react";
import { adminFetchAnalytics } from "../../../../lib/wk/api-client";
import { toastError } from "../../../../lib/wk/toast";

const metricDefs = [
  { key: "competitions", label: "Competitions (total)" },
  { key: "competitionsWithOwner", label: "Organizer-owned pools" },
  { key: "competitionsPlatform", label: "Platform pools (no owner)" },
  { key: "teamsRegistered", label: "Teams registered (excl. config)" },
  { key: "teamsLinkedToAuthUser", label: "Teams linked to Supabase user" },
  { key: "competitionMembers", label: "Pool join rows (competition_members)" },
  { key: "invitesTotal", label: "Email invites (total)" },
  { key: "invitesPending", label: "Invites pending acceptance" },
  { key: "invitesAccepted", label: "Invites accepted" },
  { key: "fixtureMappings", label: "Fixture mapping rows (shared calendar)" },
  { key: "matches", label: "Match rows (synced results)" },
  { key: "participantScoreEvents", label: "Score event rows (bonuses applied)" },
  { key: "playerPointsRollupRows", label: "Player points rollup lines" },
  { key: "fixtureSquadMembers", label: "Fixture squad member lines" },
  { key: "fixtureSquadFetched", label: "Fixtures marked squad-fetched" },
  { key: "playerStatisticsRows", label: "Player statistics rows" },
  { key: "apiFootballLeagueTypes", label: "League types in lookup" },
];

function fmtIso(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

export function AdminAnalyticsSection(props) {
  const { ta } = props;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async function() {
    setBusy(true);
    try {
      const snap = await adminFetchAnalytics();
      setData(snap);
    } catch (e) {
      console.error(e);
      toastError(ta.loadError || "Could not load analytics.", {
        description: e && e.message ? String(e.message) : undefined,
      });
      setData(null);
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }, [ta.loadError]);

  useEffect(function() {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div style={{ padding: "20px 0", color: "var(--fg-muted)", fontSize: 14 }}>
        {ta.loading || "Loading analytics…"}
      </div>
    );
  }

  if (!data || !data.counts) {
    return (
      <div style={{ padding: "20px 0" }}>
        <p style={{ color: "var(--fg-muted)", marginBottom: 12 }}>{ta.loadError || "No data."}</p>
        <button type="button" className="btn btn-outline" onClick={load} disabled={busy}>
          {ta.refresh || "Refresh"}
        </button>
      </div>
    );
  }

  const c = data.counts;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--fg-muted)", maxWidth: 720, lineHeight: 1.55 }}>
          {ta.intro ||
            "Live totals from the database: competitions, registrations, invitations, and football data footprint."}
        </p>
        <button type="button" className="btn" onClick={load} disabled={busy}>
          {busy ? "…" : ta.refresh || "Refresh"}
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
        {(ta.generatedAt || "Last fetched") + ": "}
        <strong style={{ color: "var(--fg)" }}>{fmtIso(data.generatedAt)}</strong>
      </div>

      <div style={{ fontFamily: "var(--wk-heading-font)", fontSize: 15, color: "var(--orange)", marginBottom: 4 }}>
        {ta.secPools || "Pools & teams"}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        {metricDefs.slice(0, 6).map(function(m) {
          const v = c[m.key];
          return (
            <div
              key={m.key}
              style={{
                padding: "12px 14px",
                background: "var(--bg-2)",
                borderRadius: 10,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 6, lineHeight: 1.35 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--orange)" }}>{typeof v === "number" ? v : "—"}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontFamily: "var(--wk-heading-font)", fontSize: 15, color: "var(--orange)", marginBottom: 4 }}>
        {ta.secEngagement || "Membership & invites"}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        {metricDefs.slice(6, 9).map(function(m) {
          const v = c[m.key];
          return (
            <div
              key={m.key}
              style={{
                padding: "12px 14px",
                background: "var(--bg-2)",
                borderRadius: 10,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 6, lineHeight: 1.35 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--orange)" }}>{typeof v === "number" ? v : "—"}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontFamily: "var(--wk-heading-font)", fontSize: 15, color: "var(--orange)", marginBottom: 4 }}>
        {ta.secData || "API-Football data"}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        {metricDefs.slice(9, 14).map(function(m) {
          const v = c[m.key];
          return (
            <div
              key={m.key}
              style={{
                padding: "12px 14px",
                background: "var(--bg-2)",
                borderRadius: 10,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 6, lineHeight: 1.35 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--orange)" }}>{typeof v === "number" ? v : "—"}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontFamily: "var(--wk-heading-font)", fontSize: 15, color: "var(--orange)", marginBottom: 4 }}>
        {ta.secScoring || "Matches & scoring"}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        {metricDefs.slice(14).map(function(m) {
          const v = c[m.key];
          return (
            <div
              key={m.key}
              style={{
                padding: "12px 14px",
                background: "var(--bg-2)",
                borderRadius: 10,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 6, lineHeight: 1.35 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--orange)" }}>{typeof v === "number" ? v : "—"}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontFamily: "var(--wk-heading-font)", fontSize: 15, color: "#10B981", marginBottom: 8 }}>
        {ta.secTopPools || "Pools with most teams"}
      </div>
      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-3)", textAlign: "left" }}>
              <th style={{ padding: "10px 12px" }}>{ta.colPool || "Pool"}</th>
              <th style={{ padding: "10px 12px" }}>{ta.colTeams || "Teams"}</th>
              <th style={{ padding: "10px 12px" }}>{ta.colOwner || "Owner"}</th>
            </tr>
          </thead>
          <tbody>
            {(data.topPoolsByTeamCount || []).map(function(row) {
              return (
                <tr key={String(row.competition_id)} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px" }}>
                    <strong>{row.name || "—"}</strong>
                    <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                      {row.slug || "—"} · id {row.competition_id}
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px", fontWeight: 700 }}>{row.team_count}</td>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--fg-muted)", wordBreak: "break-all" }}>
                    {row.owner_user_id ? row.owner_user_id : ta.platform || "Platform"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(!data.topPoolsByTeamCount || data.topPoolsByTeamCount.length === 0) && (
          <div style={{ padding: 16, fontSize: 13, color: "var(--fg-muted)" }}>—</div>
        )}
      </div>

      <div style={{ fontFamily: "var(--wk-heading-font)", fontSize: 15, color: "#10B981", marginBottom: 8 }}>
        {ta.secRecent || "Recent team sign-ups"}
      </div>
      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-3)", textAlign: "left" }}>
              <th style={{ padding: "10px 12px" }}>{ta.colWhen || "When"}</th>
              <th style={{ padding: "10px 12px" }}>{ta.colEmail || "Email"}</th>
              <th style={{ padding: "10px 12px" }}>{ta.colTeam || "Team"}</th>
              <th style={{ padding: "10px 12px" }}>{ta.colCompetition || "Pool id"}</th>
            </tr>
          </thead>
          <tbody>
            {(data.recentTeamRegistrations || []).map(function(row) {
              return (
                <tr key={String(row.id)} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{fmtIso(row.created_at)}</td>
                  <td style={{ padding: "8px 12px", wordBreak: "break-all" }}>{row.email || "—"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    {row.teamnaam || "—"}
                    {row.naam ? <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>{row.naam}</div> : null}
                  </td>
                  <td style={{ padding: "8px 12px" }}>{row.competition_id}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(!data.recentTeamRegistrations || data.recentTeamRegistrations.length === 0) && (
          <div style={{ padding: 16, fontSize: 13, color: "var(--fg-muted)" }}>—</div>
        )}
      </div>
    </div>
  );
}
