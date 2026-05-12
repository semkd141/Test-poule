"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "../poule-context.jsx";
import {
  authGetValidSession,
  myListCompetitions,
  myCreateCompetition,
  myGetMyCompetition,
  myDeleteMyCompetition,
  myListCompetitionParticipants,
  myListCompetitionFixtureMappings,
  myPatchMyCompetition,
  mySendCompetitionInvite,
  myListCompetitionInvites,
  myImportApiFootballFixtures,
  myFetchAllFixtureSquads,
  listLeagueTypes,
} from "../../../lib/wk/api-client";
import { toastError, toastSuccess, toastWarning } from "../../../lib/wk/toast";

function isoToDatetimeLocal(iso) {
  if (!iso || typeof iso !== "string") return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = function(n) {
    return String(n).padStart(2, "0");
  };
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}

export function CompetitionTab() {
  const { t, setTab } = useApp();
  const tc = t.competitionTab || {};
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [competitions, setCompetitions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [leagueTypes, setLeagueTypes] = useState([]);
  const [newPool, setNewPool] = useState({ slug: "", name: "", league_type: "", season_label: "", starts_at: "" });
  const [selectedId, setSelectedId] = useState("");
  const [participants, setParticipants] = useState([]);
  const [fixtureMappings, setFixtureMappings] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    slug: "",
    league_type: "",
    season_label: "",
    starts_at: "",
  });
  const [editSaved, setEditSaved] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRows, setInviteRows] = useState([]);
  const [importLeague, setImportLeague] = useState("1");
  const [importSeason, setImportSeason] = useState("2022");
  const [importBusy, setImportBusy] = useState(false);
  const [fetchAllSquadsBusy, setFetchAllSquadsBusy] = useState(false);

  const refreshSession = useCallback(async function() {
    setLoadingSession(true);
    try {
      const s = await authGetValidSession();
      setSession(s && s.access_token ? s : null);
    } catch {
      setSession(null);
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(function() {
    refreshSession();
  }, [refreshSession]);

  useEffect(function() {
    listLeagueTypes()
      .then(function(rows) {
        setLeagueTypes(Array.isArray(rows) ? rows : []);
      })
      .catch(function() {
        setLeagueTypes([]);
      });
  }, []);

  const loadCompetitions = useCallback(async function() {
    if (!session) return;
    try {
      const rows = await myListCompetitions();
      const list = Array.isArray(rows) ? rows : [];
      const uid = session.user && session.user.id != null ? String(session.user.id).trim() : "";
      const onlyMine =
        uid.length > 0
          ? list.filter(function(c) {
              return c && String(c.owner_user_id || "").trim() === uid;
            })
          : [];
      setCompetitions(onlyMine);
    } catch (e) {
      console.error("myListCompetitions", e);
      setCompetitions([]);
    }
  }, [session]);

  useEffect(function() {
    if (session) loadCompetitions();
  }, [session, loadCompetitions]);

  useEffect(function() {
    if (!selectedId) {
      setParticipants([]);
      setFixtureMappings([]);
      setInviteRows([]);
      return;
    }
    (async function() {
      try {
        const [plist, maps] = await Promise.all([
          myListCompetitionParticipants(selectedId),
          myListCompetitionFixtureMappings(selectedId),
        ]);
        setParticipants(Array.isArray(plist) ? plist : []);
        setFixtureMappings(Array.isArray(maps) ? maps : []);
      } catch (e) {
        console.error(e);
        setParticipants([]);
        setFixtureMappings([]);
      }
    })();
  }, [selectedId]);

  useEffect(
    function() {
      if (!selectedId || !session) {
        setInviteRows([]);
        return;
      }
      (async function() {
        try {
          const rows = await myListCompetitionInvites(selectedId);
          setInviteRows(Array.isArray(rows) ? rows : []);
        } catch (e) {
          console.error(e);
          setInviteRows([]);
        }
      })();
    },
    [selectedId, session],
  );

  const selected = competitions.find(function(c) {
    return String(c.id) === String(selectedId);
  });

  useEffect(
    function() {
      if (!selected) return;
      setEditForm({
        name: String(selected.name ?? ""),
        slug: String(selected.slug ?? ""),
        league_type: selected.league_type != null && String(selected.league_type).trim()
          ? String(selected.league_type).trim()
          : "",
        season_label: selected.season_label != null && selected.season_label !== undefined
          ? String(selected.season_label)
          : "",
        starts_at: isoToDatetimeLocal(selected.starts_at),
      });
      setEditSaved(false);
    },
    [selected],
  );

  async function savePoolEdits() {
    if (!selectedId) return;
    if (!editForm.slug.trim() || !editForm.name.trim()) {
      toastError(tc.slugNameRequired || "Slug and name are required.");
      return;
    }
    setBusy(true);
    try {
      var patchBody = {
        slug: editForm.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        name: editForm.name.trim(),
        season_label: editForm.season_label.trim() || null,
        starts_at: editForm.starts_at ? new Date(editForm.starts_at).toISOString() : null,
      };
      await myPatchMyCompetition(selectedId, patchBody);
      setEditSaved(true);
      setTimeout(function() {
        setEditSaved(false);
      }, 2500);
      await loadCompetitions();
      try {
        const fresh = await myGetMyCompetition(selectedId);
        if (fresh && typeof fresh === "object") {
          setCompetitions(function(prev) {
            return prev.map(function(c) {
              return String(c.id) === String(selectedId) ? Object.assign({}, c, fresh) : c;
            });
          });
        }
      } catch {
        /* list already reloaded */
      }
    } catch (e) {
      toastError((tc.updateFailed || "Save failed") + ": " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  }

  async function createPool() {
    if (!newPool.slug.trim() || !newPool.name.trim()) {
      toastError(tc.slugNameRequired || "Slug and name are required.");
      return;
    }
    if (!newPool.league_type || !String(newPool.league_type).trim()) {
      toastError(tc.leagueTypeRequired || "Choose a competition type.");
      return;
    }
    setBusy(true);
    try {
      const raw = await myCreateCompetition({
        slug: newPool.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        name: newPool.name.trim(),
        league_type: String(newPool.league_type).trim(),
        season_label: newPool.season_label.trim() || undefined,
        starts_at: newPool.starts_at ? new Date(newPool.starts_at).toISOString() : undefined,
      });
      setNewPool({ slug: "", name: "", league_type: "", season_label: "", starts_at: "" });
      await loadCompetitions();
      var created = Array.isArray(raw) ? raw[0] : raw;
      if (created && created.id != null) setSelectedId(String(created.id));
    } catch (e) {
      toastError((tc.createFailed || "Could not create pool") + ": " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  }

  async function deletePool(c) {
    if (!c || !c.id) return;
    setBusy(true);
    try {
      await myDeleteMyCompetition(c.id);
      setConfirmDelete(null);
      if (String(selectedId) === String(c.id)) setSelectedId("");
      await loadCompetitions();
    } catch (e) {
      toastError((tc.deleteFailed || "Could not delete") + ": " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite() {
    if (!selectedId || !inviteEmail.trim()) {
      toastError(tc.inviteEmailRequired || "Enter an email address.");
      return;
    }
    setBusy(true);
    try {
      const r = await mySendCompetitionInvite(selectedId, inviteEmail.trim());
      setInviteEmail("");
      const rows = await myListCompetitionInvites(selectedId);
      setInviteRows(Array.isArray(rows) ? rows : []);
      if (!r.emailed) {
        const reason =
          typeof r.emailReason === "string" && r.emailReason.trim()
            ? `\n\n${r.emailReason.trim().length > 400 ? `${r.emailReason.trim().slice(0, 397)}…` : r.emailReason.trim()}`
            : "";
        toastWarning(tc.inviteNoEmail || "Email not configured. Copy the link below.", {
          description: `${r.inviteUrl}${reason}`,
          duration: 25000,
        });
      }
    } catch (e) {
      toastError((tc.inviteSendFailed || "Invite failed") + ": " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  }

  useEffect(
    function() {
      if (!selected) return;
      var lid = selected.api_football_league_id;
      if (lid != null && lid !== "" && Number.isFinite(Number(lid)) && Number(lid) > 0) {
        setImportLeague(String(Math.floor(Number(lid))));
      }
    },
    [selected],
  );

  async function importFixturesFromApi() {
    if (!selectedId) return;
    var leagueNum = parseInt(String(importLeague).trim(), 10);
    var seasonNum = parseInt(String(importSeason).trim(), 10);
    var body = {};
    if (Number.isFinite(leagueNum) && leagueNum > 0 && Number.isFinite(seasonNum) && seasonNum > 0) {
      body = { league: leagueNum, season: seasonNum };
    } else if (Number.isFinite(seasonNum) && seasonNum > 0) {
      body = { season: seasonNum };
    }
    setImportBusy(true);
    try {
      var result = await myImportApiFootballFixtures(selectedId, body);
      var maps = await myListCompetitionFixtureMappings(selectedId);
      setFixtureMappings(Array.isArray(maps) ? maps : []);
      if (result.written > 0) {
        var msg = (tc.importFixturesSuccess || "Saved {n} fixtures ({total} from API).")
          .replace("{n}", String(result.written))
          .replace("{total}", String(result.totalFromApi));
        toastSuccess(msg);
      } else {
        toastWarning(
          tc.importFixturesNone || "No rows imported.",
          result.message ? { description: result.message } : undefined,
        );
      }
    } catch (e) {
      toastError((tc.importFixturesTitle || "Import failed") + ": " + (e.message || ""));
    } finally {
      setImportBusy(false);
    }
  }

  async function fetchAllFixtureSquads() {
    if (!selectedId) return;
    var withId = fixtureMappings.filter(function(m) {
      return (
        m.api_fixture_id != null &&
        m.api_fixture_id !== "" &&
        Number.isFinite(Number(m.api_fixture_id)) &&
        Number(m.api_fixture_id) > 0
      );
    });
    if (withId.length === 0) {
      toastWarning(tc.fetchAllFixtureSquadsNoMappings || "No fixtures with a valid API fixture id yet.");
      return;
    }
    setFetchAllSquadsBusy(true);
    try {
      var out = await myFetchAllFixtureSquads(selectedId);
      toastSuccess(out.message || tc.fetchAllFixtureSquadsStarted || "Squad members are being fetched.");
    } catch (e) {
      toastError((tc.fetchAllFixtureSquadsFailed || "Could not start squad fetch") + ": " + (e.message || ""));
    } finally {
      setFetchAllSquadsBusy(false);
    }
  }

  if (loadingSession) {
    return <div className="spinner"></div>;
  }

  if (!session) {
    return (
      <div className="card">
        <div className="card-title" style={{ fontSize: 20 }}>
          {tc.title || "Competition"}
        </div>
        <p style={{ color: "var(--fg-muted)", marginBottom: 16, lineHeight: 1.5 }}>
          {tc.signInHint ||
            "Sign in first (use Register or My Team) to create a pool and invite others with your competition slug."}
        </p>
        <button type="button" className="btn" onClick={function() { setTab("edit"); }}>
          {tc.goToMyTeam || "My Team / sign in"}
        </button>
      </div>
    );
  }

  var ltForDisplay =
    editForm.league_type != null && String(editForm.league_type).trim()
      ? String(editForm.league_type).trim()
      : "";
  var leagueTypeEditDisplay = "";
  if (ltForDisplay) {
    var lo = leagueTypes.find(function(o) {
      return o.league_type === ltForDisplay;
    });
    leagueTypeEditDisplay = lo ? ltForDisplay + " (API league " + lo.league_id + ")" : ltForDisplay;
  }

  return (
    <div className="card">
      <div className="card-title" style={{ fontSize: 20 }}>
        {tc.title || "Competition"}
      </div>
      <p style={{ color: "var(--fg-muted)", marginBottom: 18, fontSize: 13, lineHeight: 1.5 }}>
        {tc.intro ||
          "You own the pools you create. Send email invitations or share the pool; invitees must accept the link (signed in with that email) before they can register."}
      </p>

      <div
        style={{
          padding: "14px 16px",
          background: "var(--bg-3)",
          borderRadius: 10,
          marginBottom: 18,
          borderLeft: "3px solid var(--orange)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{tc.createPool || "Create a pool"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 10 }}>
          <input
            placeholder={tc.slugPh || "slug (e.g. office-2026)"}
            value={newPool.slug}
            onChange={function(e) { setNewPool(Object.assign({}, newPool, { slug: e.target.value })); }}
            style={{ margin: 0 }}
          />
          <input
            placeholder={tc.namePh || "Display name"}
            value={newPool.name}
            onChange={function(e) { setNewPool(Object.assign({}, newPool, { name: e.target.value })); }}
            style={{ margin: 0 }}
          />
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--fg-muted)", margin: 0 }}>
            {/* {tc.leagueTypeLabel || "Competition type"} */}
            <select
              required
              value={newPool.league_type}
              onChange={function(e) { setNewPool(Object.assign({}, newPool, { league_type: e.target.value })); }}
              style={{ margin: 0, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--fg)" }}
            >
              <option value="">{tc.leagueTypePlaceholder || "— choose —"}</option>
              {leagueTypes.map(function(opt) {
                return (
                  <option key={opt.league_type} value={opt.league_type}>
                    {opt.league_type} (API league {opt.league_id})
                  </option>
                );
              })}
            </select>
          </label>
          <input
            placeholder={tc.seasonPh || "season (optional)"}
            value={newPool.season_label}
            onChange={function(e) { setNewPool(Object.assign({}, newPool, { season_label: e.target.value })); }}
            style={{ margin: 0 }}
          />
          <input
            type="datetime-local"
            value={newPool.starts_at}
            onChange={function(e) { setNewPool(Object.assign({}, newPool, { starts_at: e.target.value })); }}
            style={{ margin: 0 }}
          />
        </div>
        <button type="button" className="btn" onClick={createPool} disabled={busy}>
          {busy ? "…" : tc.submitCreate || "Create"}
        </button>
      </div>

      <div style={{ marginBottom: 14, fontWeight: 600 }}>{tc.yourPools || "Your competitions"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {competitions.map(function(c) {
          return (
            <div
              key={c.id}
              style={{
                fontSize: 13,
                padding: "8px 10px",
                background: "var(--bg-2)",
                borderRadius: 8,
                border: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <strong>{c.name}</strong>{" "}
                <span style={{ color: "var(--fg-muted)" }}>({c.slug})</span>
                {c.season_label ? (
                  <span style={{ marginLeft: 6, color: "var(--fg-muted)" }}>• {c.season_label}</span>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={function() {
                    setSelectedId(String(c.id));
                  }}
                >
                  {String(selectedId) === String(c.id) ? (tc.selected || "Selected") : (tc.manage || "Manage")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: "4px 10px", fontSize: 12, color: "#EF4444", borderColor: "#EF4444" }}
                  onClick={function() { setConfirmDelete(c); }}
                  disabled={busy}
                >
                  {tc.delete || "Delete"}
                </button>
              </div>
            </div>
          );
        })}
        {competitions.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>{tc.noPoolsYet || "No pools yet — create one above."}</div>
        ) : null}
      </div>

      {selected ? (
        <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--wk-heading-font)", fontSize: 14, marginBottom: 10, color: "var(--orange)" }}>
            {tc.editSection || "Edit"}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <input
              readOnly
              placeholder={tc.slugPh || "slug"}
              value={editForm.slug}
              onChange={function(e) {
                setEditForm(Object.assign({}, editForm, { slug: e.target.value }));
              }}
              style={{ margin: 0 }}
            />
            <input
              placeholder={tc.namePh || "Display name"}
              value={editForm.name}
              onChange={function(e) {
                setEditForm(Object.assign({}, editForm, { name: e.target.value }));
              }}
              style={{ margin: 0 }}
            />
            <input
              readOnly
              value={leagueTypeEditDisplay}
              placeholder={tc.leagueTypePlaceholder || "— choose type —"}
              title={tc.leagueTypeReadonlyHint || "Competition type cannot be changed after the pool is created."}
              aria-label={tc.leagueTypeLabel || "Competition type"}
              style={{ margin: 0, cursor: "default" }}
            />
            <input
              readOnly
              placeholder={tc.seasonPh || "season (optional)"}
              value={editForm.season_label}
              onChange={function(e) {
                setEditForm(Object.assign({}, editForm, { season_label: e.target.value }));
              }}
              style={{ margin: 0 }}
            />
            <input
              type="datetime-local"
              value={editForm.starts_at}
              onChange={function(e) {
                setEditForm(Object.assign({}, editForm, { starts_at: e.target.value }));
              }}
              style={{ margin: 0 }}
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
            <button type="button" className="btn" onClick={savePoolEdits} disabled={busy}>
              {busy ? "…" : editSaved ? "✓ " + (tc.updated || "Saved") : t.save}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: 12 }}
              onClick={function() {
                setEditForm(function(prev) {
                  return Object.assign({}, prev, { starts_at: "" });
                });
              }}
            >
              {tc.clearStart || "Clear start date"}
            </button>
          </div>

          <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 12 }}>
            <div>
              {tc.teamsLabel || "Teams registered"}: {participants.length}
            </div>
          </div>

          <div style={{ marginTop: 16, marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--wk-heading-font)", fontSize: 14, marginBottom: 8, color: "var(--orange)" }}>
              {tc.importFixturesTitle || "Import fixtures (API-Football)"}
            </div>
            <p style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 10, lineHeight: 1.45 }}>
              {tc.importFixturesHint ||
                "Fetch fixtures from API-Football and save as mappings. Server needs API_FOOTBALL_KEY."}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--fg-muted)" }}>
                {tc.importFixturesLeagueLabel || "League id"}
                <input
                  type="number"
                  min="1"
                  value={importLeague}
                  onChange={function(e) {
                    setImportLeague(e.target.value);
                  }}
                  style={{ margin: 0, width: 120 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--fg-muted)" }}>
                {tc.importFixturesSeasonLabel || "Season"}
                <input
                  type="number"
                  min="1900"
                  value={importSeason}
                  onChange={function(e) {
                    setImportSeason(e.target.value);
                  }}
                  style={{ margin: 0, width: 120 }}
                />
              </label>
              <button
                type="button"
                className="btn"
                style={{ alignSelf: "flex-end", marginTop: 16 }}
                disabled={busy || importBusy}
                onClick={importFixturesFromApi}
              >
                {importBusy ? (tc.importFixturesBusy || "…") : (tc.importFixturesButton || "Import")}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 16, marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--wk-heading-font)", fontSize: 14, marginBottom: 8 }}>{tc.invitesTitle || "Email invitations"}</div>
            <p style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 8, lineHeight: 1.45 }}>
              {tc.invitesHelp ||
                "We send a link like https://yoursite.com/?invite=… Recipients sign in with the invited email, then register on the Register tab."}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <input
                type="email"
                placeholder={tc.inviteEmailPh || "friend@email.com"}
                value={inviteEmail}
                onChange={function(e) {
                  setInviteEmail(e.target.value);
                }}
                style={{ margin: 0, minWidth: 200, flex: "1 1 200px" }}
              />
              <button type="button" className="btn" onClick={sendInvite} disabled={busy}>
                {busy ? "…" : tc.sendInvite || "Send invite"}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflow: "auto", fontSize: 12 }}>
              {inviteRows.map(function(inv) {
                const pending = !inv.accepted_at;
                return (
                  <div
                    key={inv.id}
                    style={{
                      padding: "6px 8px",
                      background: "var(--bg-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      <code>{inv.email}</code>
                      <span style={{ color: "var(--fg-muted)", marginLeft: 8 }}>
                        {pending ? tc.invitePending || "pending" : tc.inviteAccepted || "accepted"}
                      </span>
                    </span>
                    <span style={{ color: "var(--fg-muted)" }}>
                      {inv.expires_at ? String(inv.expires_at).slice(0, 10) : ""}
                    </span>
                  </div>
                );
              })}
              {inviteRows.length === 0 ? (
                <div style={{ color: "var(--fg-muted)" }}>{tc.noInvitesYet || "No invites sent for this pool yet."}</div>
              ) : null}
            </div>
          </div>

          {fixtureMappings.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontFamily: "var(--wk-heading-font)",
                  fontSize: 14,
                  marginBottom: 8,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span>{tc.fixturesTitle || "Fixture links (API Football id)"}</span>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: "6px 12px", fontSize: 12, whiteSpace: "nowrap" }}
                  disabled={busy || importBusy || fetchAllSquadsBusy}
                  title={tc.fetchAllFixtureSquadsHint || ""}
                  onClick={fetchAllFixtureSquads}
                >
                  {fetchAllSquadsBusy
                    ? tc.fetchAllFixtureSquadsBusy || "…"
                    : tc.fetchAllFixtureSquadsButton || "Fetch players for all fixtures"}
                </button>
              </div>
              <p style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 8, lineHeight: 1.45 }}>
                {tc.fetchAllFixtureSquadsHint ||
                  "Starts a background job: one API call per fixture, 3s pause between calls; sides already stored for this league, season, and team name are skipped."}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflow: "auto" }}>
                {fixtureMappings.map(function(m) {
                  var hasFx =
                    m.api_fixture_id != null &&
                    m.api_fixture_id !== "" &&
                    Number.isFinite(Number(m.api_fixture_id)) &&
                    Number(m.api_fixture_id) > 0;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 100px) 64px minmax(0, 1fr)",
                        gap: 8,
                        alignItems: "center",
                        fontSize: 12,
                        padding: "6px 8px",
                        background: "var(--bg-2)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    >
                      <code style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{m.local_key}</code>
                      <span style={{ color: "var(--fg-muted)" }}>{m.stage}</span>
                      <code style={{ margin: 0, color: "var(--fg)", opacity: hasFx ? 1 : 0.5, minWidth: 0 }}>
                        {hasFx ? String(m.api_fixture_id) : "—"}
                      </code>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 8 }}>
              {tc.noMappings || "No fixture rows for this pool yet (mappings are added when the competition is seeded)."}
            </div>
          )}
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="modal-backdrop" onClick={function() { if (!busy) setConfirmDelete(null); }}>
          <div className="modal" onClick={function(e) { e.stopPropagation(); }}>
            <div className="modal-title">{tc.confirmDelTitle || "Delete competition?"}</div>
            <p style={{ fontSize: 14, marginBottom: 16 }}>
              {tc.confirmDelBody || "This removes the pool if the database allows it (teams linked may block delete)."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-outline" onClick={function() { setConfirmDelete(null); }} disabled={busy}>
                {t.cancel}
              </button>
              <button type="button" className="btn" onClick={function() { deletePool(confirmDelete); }} disabled={busy} style={{ background: "#B91C1C", color: "#fff" }}>
                {busy ? "…" : tc.confirmDelete || "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
