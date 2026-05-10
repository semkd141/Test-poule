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
  myPatchCompetitionFixtureMapping,
  myPatchMyCompetition,
  mySendCompetitionInvite,
  myListCompetitionInvites,
} from "../../../lib/wk/api-client";
import { toastError, toastWarning } from "../../../lib/wk/toast";

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
  const [newPool, setNewPool] = useState({ slug: "", name: "", season_label: "", starts_at: "" });
  const [selectedId, setSelectedId] = useState("");
  const [participants, setParticipants] = useState([]);
  const [fixtureMappings, setFixtureMappings] = useState([]);
  const [mappingBusyId, setMappingBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    slug: "",
    season_label: "",
    starts_at: "",
    metadataJson: "{}",
  });
  const [editSaved, setEditSaved] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRows, setInviteRows] = useState([]);

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

  const loadCompetitions = useCallback(async function() {
    if (!session) return;
    try {
      const rows = await myListCompetitions();
      setCompetitions(Array.isArray(rows) ? rows : []);
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
      var metaStr = "{}";
      try {
        var m = selected.metadata;
        metaStr = JSON.stringify(m && typeof m === "object" && !Array.isArray(m) ? m : {}, null, 2);
      } catch {
        metaStr = "{}";
      }
      setEditForm({
        name: String(selected.name ?? ""),
        slug: String(selected.slug ?? ""),
        season_label: selected.season_label != null && selected.season_label !== undefined
          ? String(selected.season_label)
          : "",
        starts_at: isoToDatetimeLocal(selected.starts_at),
        metadataJson: metaStr,
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
    var meta = {};
    try {
      meta = editForm.metadataJson.trim() ? JSON.parse(editForm.metadataJson) : {};
      if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
        throw new Error("object");
      }
    } catch {
      toastError(tc.metadataInvalid || "Metadata must be a JSON object.");
      return;
    }
    setBusy(true);
    try {
      await myPatchMyCompetition(selectedId, {
        slug: editForm.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        name: editForm.name.trim(),
        season_label: editForm.season_label.trim() || null,
        starts_at: editForm.starts_at ? new Date(editForm.starts_at).toISOString() : null,
        metadata: meta,
      });
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
    setBusy(true);
    try {
      await myCreateCompetition({
        slug: newPool.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        name: newPool.name.trim(),
        season_label: newPool.season_label.trim() || undefined,
        starts_at: newPool.starts_at ? new Date(newPool.starts_at).toISOString() : undefined,
      });
      setNewPool({ slug: "", name: "", season_label: "", starts_at: "" });
      await loadCompetitions();
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

  async function saveFixtureMapping(row, valueRaw) {
    const val = String(valueRaw ?? "").trim();
    const nextId = val ? Number(val) : null;
    if (nextId !== null && (!Number.isInteger(nextId) || nextId <= 0)) {
      toastError(tc.fixtureIdPositive || "Fixture id must be a positive integer.");
      return;
    }
    if (nextId !== null) {
      const dup = fixtureMappings.find(function(x) {
        return Number(x.id) !== Number(row.id) && Number(x.api_fixture_id || 0) === nextId;
      });
      if (dup) {
        toastError(tc.fixtureDup || "That API fixture id is already used in this pool.");
        return;
      }
    }
    setMappingBusyId(row.id);
    try {
      await myPatchCompetitionFixtureMapping(selectedId, row.id, nextId);
      const maps = await myListCompetitionFixtureMappings(selectedId);
      setFixtureMappings(Array.isArray(maps) ? maps : []);
    } catch (e) {
      toastError((tc.mappingFailed || "Mapping update failed") + ": " + (e.message || ""));
    } finally {
      setMappingBusyId(null);
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
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 12, marginBottom: 4, color: "var(--fg-muted)" }}>
              {tc.metadataLabel || "Metadata (JSON)"}
            </label>
            <textarea
              rows={4}
              value={editForm.metadataJson}
              onChange={function(e) {
                setEditForm(Object.assign({}, editForm, { metadataJson: e.target.value }));
              }}
              style={{
                margin: 0,
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
              }}
              spellCheck={false}
            />
            <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 4 }}>
              {tc.metadataHint || "Optional JSON object."}
            </div>
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
              {tc.poolIdLabel || "Pool id"}: <code>{selected.id}</code>
            </div>
            <div style={{ marginTop: 4 }}>
              {tc.teamsLabel || "Teams registered"}: {participants.length}
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
              <div style={{ fontFamily: "var(--wk-heading-font)", fontSize: 14, marginBottom: 8 }}>
                {tc.fixturesTitle || "Fixture links (API Football id)"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflow: "auto" }}>
                {fixtureMappings.map(function(m) {
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 72px 1fr auto",
                        gap: 8,
                        alignItems: "center",
                        fontSize: 12,
                        padding: "6px 8px",
                        background: "var(--bg-2)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    >
                      <code>{m.local_key}</code>
                      <span style={{ color: "var(--fg-muted)" }}>{m.stage}</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="api_fixture_id"
                        defaultValue={m.api_fixture_id ?? ""}
                        id={"owner-fixture-input-" + m.id}
                        key={m.id + "-" + (m.api_fixture_id ?? "")}
                        style={{ margin: 0 }}
                      />
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        disabled={mappingBusyId === m.id}
                        onClick={function() {
                          var el = document.getElementById("owner-fixture-input-" + m.id);
                          var v = el && "value" in el ? el.value : "";
                          saveFixtureMapping(m, v);
                        }}
                      >
                        {mappingBusyId === m.id ? "…" : tc.saveMap || "Save"}
                      </button>
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
