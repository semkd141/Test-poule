"use client";

import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { DEFAULT_DEADLINE_LABEL } from "@/lib/wk/config";
import { useApp } from "../../poule-context.jsx";
import {
  dbToevoegen,
  dbBijwerkenSpelers,
  adminListCompetitions,
  adminCreateCompetition,
  adminDeleteCompetition,
  adminListFixtureMappings,
  listLeagueTypes,
} from "../../../../lib/wk/api-client";
import { toastError } from "../../../../lib/wk/toast";
import { AdminRow } from "./admin-row.jsx";

export function AdminTab() {
  const { t, participants, config, reloadParticipants, setTab } = useApp();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDeleteCompetition, setConfirmDeleteCompetition] = useState(null);
  const [adminChildTab, setAdminChildTab] = useState("points");

  // Deadline editing state
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineLabel, setDeadlineLabel] = useState("");
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [deadlineSaved, setDeadlineSaved] = useState(false);
  const [competitions, setCompetitions] = useState([]);
  const [competitionBusy, setCompetitionBusy] = useState(false);
  const [leagueTypes, setLeagueTypes] = useState([]);
  const [newCompetition, setNewCompetition] = useState({
    slug: "",
    name: "",
    league_type: "",
    season_label: "",
    starts_at: "",
  });
  const [selectedCompetitionId, setSelectedCompetitionId] = useState("");
  const [fixtureMappings, setFixtureMappings] = useState([]);

  // Initialize deadline editor with current config
  useEffect(function() {
    const d = config.deadline;
    if (d && !isNaN(d.getTime())) {
      const pad = function(n){ return String(n).padStart(2,"0"); };
      const localStr = d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
      setDeadlineDate(localStr);
    }
    setDeadlineLabel(config.deadlineLabel || "");
  }, [config.deadline.getTime(), config.deadlineLabel]);

  async function loadCompetitions() {
    try {
      const rows = await adminListCompetitions();
      setCompetitions(rows);
    } catch (e) {
      console.error("adminListCompetitions failed", e);
    }
  }

  useEffect(function() {
    loadCompetitions();
  }, []);

  useEffect(function() {
    listLeagueTypes()
      .then(function(rows) {
        setLeagueTypes(Array.isArray(rows) ? rows : []);
      })
      .catch(function() {
        setLeagueTypes([]);
      });
  }, []);

  useEffect(function() {
    if (!selectedCompetitionId) {
      setFixtureMappings([]);
      return;
    }
    (async function() {
      try {
        const rows = await adminListFixtureMappings(selectedCompetitionId);
        setFixtureMappings(rows);
      } catch (e) {
        console.error("adminListFixtureMappings failed", e);
      }
    })();
  }, [selectedCompetitionId]);

  async function saveDeadline() {
    if (!deadlineDate) return;
    setSavingDeadline(true);
    try {
      const isoDate = new Date(deadlineDate).toISOString();
      const cfgPayload = { deadline: isoDate, deadlineLabel: deadlineLabel || DEFAULT_DEADLINE_LABEL };
      if (config.cfgRowId) {
        await dbBijwerkenSpelers(config.cfgRowId, cfgPayload);
      } else {
        await dbToevoegen({
          naam: "__config__",
          teamnaam: "__config__",
          email: "__config__",
          systeem: "config",
          spelers: cfgPayload
        });
      }
      setDeadlineSaved(true);
      setTimeout(function(){ setDeadlineSaved(false); }, 2500);
      await reloadParticipants();
    } catch (e) {
      toastError("Fout: " + e.message);
    } finally {
      setSavingDeadline(false);
    }
  }

  function doLogout() {
    setTab("ranking");
    setConfirmLogout(false);
  }

  function exportExcel() {
    const rows = [];
    participants.forEach(function(p) {
      let sp = p.spelers;
      if (typeof sp === "string") { try { sp = JSON.parse(sp); } catch { sp = []; } }
      if (!Array.isArray(sp)) sp = [];
      const totalPts = sp.reduce(function(s, x) { return s + (Number(x.punten) || 0); }, 0);
      rows.push({
        Naam: p.naam,
        Teamnaam: p.teamnaam,
        Email: p.email,
        Systeem: p.systeem,
        TotaalPunten: totalPts,
        Spelers: sp.map(function(x) {
          if (x.positie === "coach") return "coach:" + (x.spelerNaam || "?") + " [" + (x.punten || 0) + "pt]";
          return x.positie + ":" + (x.spelerNaam || x.land || "?") + (x.land && x.spelerNaam ? " (" + x.land + ")" : "") + " [" + (x.punten || 0) + "pt]";
        }).join(" | ")
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "WK2026");
    XLSX.writeFile(wb, "wk2026_poule.xlsx");
  }

  async function createCompetition() {
    if (!newCompetition.slug.trim() || !newCompetition.name.trim()) {
      toastError("Slug and name are required.");
      return;
    }
    if (!newCompetition.league_type || !String(newCompetition.league_type).trim()) {
      toastError("Choose a competition type.");
      return;
    }
    setCompetitionBusy(true);
    try {
      await adminCreateCompetition({
        slug: newCompetition.slug.trim().toLowerCase(),
        name: newCompetition.name.trim(),
        league_type: String(newCompetition.league_type).trim(),
        season_label: newCompetition.season_label.trim() || undefined,
        starts_at: newCompetition.starts_at ? new Date(newCompetition.starts_at).toISOString() : undefined,
      });
      setNewCompetition({ slug: "", name: "", league_type: "", season_label: "", starts_at: "" });
      await loadCompetitions();
    } catch (e) {
      toastError("Create competition failed: " + (e.message || "unknown"));
    } finally {
      setCompetitionBusy(false);
    }
  }

  async function deleteCompetition(c) {
    if (!c || !c.id) return;
    setCompetitionBusy(true);
    try {
      await adminDeleteCompetition(c.id);
      await loadCompetitions();
      await reloadParticipants();
      setConfirmDeleteCompetition(null);
    } catch (e) {
      toastError("Delete competition failed: " + (e.message || "unknown"));
    } finally {
      setCompetitionBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title" style={{justifyContent:"space-between",display:"flex",flexWrap:"wrap",gap:10}}>
        <span>{t.adminPanel}</span>
        <div style={{display:"flex",gap:8}}>
          {adminChildTab === "points" ? <button className="btn" onClick={exportExcel}>📊 {t.exportExcel}</button> : null}
          <button className="btn btn-outline" onClick={function(){setConfirmLogout(true);}}>{t.logout}</button>
        </div>
      </div>

      {/* Child tabs */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <button
          className={"btn " + (adminChildTab === "points" ? "" : "btn-outline")}
          onClick={function(){ setAdminChildTab("points"); }}
        >
          {t.pointsManagement || "Points management"}
        </button>
        <button
          className={"btn " + (adminChildTab === "competitions" ? "" : "btn-outline")}
          onClick={function(){ setAdminChildTab("competitions"); }}
        >
          {t.competitionManagement || "Competition management"}
        </button>
      </div>

      {adminChildTab === "points" ? (
        <React.Fragment>
          {/* Deadline configuration */}
          <div style={{padding:"14px 16px",background:"var(--bg-3)",borderRadius:10,marginBottom:18,borderLeft:"3px solid var(--orange)"}}>
            <div style={{fontFamily:"var(--wk-heading-font)",fontSize:16,letterSpacing:"0.05em",color:"var(--orange)",marginBottom:10}}>
              {t.deadlineConfig || "Inschrijfdeadline instellen"}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:10,marginBottom:10}}>
              <div>
                <label>{t.deadlineDateLabel || "Datum & tijd"}</label>
                <input
                  type="datetime-local"
                  value={deadlineDate}
                  onChange={function(e){setDeadlineDate(e.target.value);}}
                  style={{margin:0}}
                />
              </div>
              <div>
                <label>{t.deadlineDisplayLabel || "Weergegeven tekst"}</label>
                <input
                  type="text"
                  placeholder="bijv. 10 juni 2026"
                  value={deadlineLabel}
                  onChange={function(e){setDeadlineLabel(e.target.value);}}
                  style={{margin:0}}
                />
              </div>
            </div>
            <button className="btn" onClick={saveDeadline} disabled={savingDeadline} style={{marginTop:4}}>
              {savingDeadline ? "…" : deadlineSaved ? "✓ " + t.saved : (t.saveDeadline || "Deadline opslaan")}
            </button>
        </div>

          {participants.length === 0 ? (
            <div className="empty-state">{t.noParticipants}</div>
          ) : (
            participants.map(function(p) {
              return <AdminRow key={p.id} participant={p} onReload={reloadParticipants} />;
            })
          )}
        </React.Fragment>
      ) : (
        <div style={{padding:"14px 16px",background:"var(--bg-3)",borderRadius:10,marginBottom:18,borderLeft:"3px solid #10B981"}}>
          <div style={{fontFamily:"var(--wk-heading-font)",fontSize:16,letterSpacing:"0.05em",color:"#10B981",marginBottom:10}}>
            Competitions (admin only)
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(170px, 1fr))",gap:8,marginBottom:10}}>
            <input
              placeholder="slug (e.g. wc2026)"
              value={newCompetition.slug}
              onChange={function(e){ setNewCompetition(Object.assign({}, newCompetition, { slug: e.target.value })); }}
              style={{margin:0}}
            />
            <input
              placeholder="name (e.g. World Cup 2026)"
              value={newCompetition.name}
              onChange={function(e){ setNewCompetition(Object.assign({}, newCompetition, { name: e.target.value })); }}
              style={{margin:0}}
            />
            <select
              value={newCompetition.league_type}
              onChange={function(e){ setNewCompetition(Object.assign({}, newCompetition, { league_type: e.target.value })); }}
              style={{margin:0,padding:"8px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-2)",color:"var(--fg)"}}
            >
              <option value="">— competition type —</option>
              {leagueTypes.map(function(opt) {
                return (
                  <option key={opt.league_type} value={opt.league_type}>
                    {opt.league_type} (API {opt.league_id})
                  </option>
                );
              })}
            </select>
            <input
              placeholder="season label (optional)"
              value={newCompetition.season_label}
              onChange={function(e){ setNewCompetition(Object.assign({}, newCompetition, { season_label: e.target.value })); }}
              style={{margin:0}}
            />
            <input
              type="datetime-local"
              value={newCompetition.starts_at}
              onChange={function(e){ setNewCompetition(Object.assign({}, newCompetition, { starts_at: e.target.value })); }}
              style={{margin:0}}
            />
          </div>
          <button className="btn" onClick={createCompetition} disabled={competitionBusy}>
            {competitionBusy ? "…" : "Create competition"}
          </button>
          <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
            {competitions.map(function(c) {
              return (
                <div key={c.id} style={{fontSize:13,padding:"6px 8px",background:"var(--bg-2)",borderRadius:8,border:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div style={{minWidth:0}}>
                    <strong>{c.name}</strong> <span style={{color:"var(--fg-muted)"}}>({c.slug})</span>
                    {c.season_label ? <span style={{marginLeft:6,color:"var(--fg-muted)"}}>• {c.season_label}</span> : null}
                  </div>
                  <button
                    className="btn btn-outline"
                    style={{padding:"4px 10px",fontSize:12,color:"#EF4444",borderColor:"#EF4444"}}
                    onClick={function(){ setConfirmDeleteCompetition(c); }}
                    disabled={competitionBusy}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
            {competitions.length === 0 ? <div style={{fontSize:12,color:"var(--fg-muted)"}}>No competitions found.</div> : null}
          </div>

          <div style={{marginTop:16,paddingTop:12,borderTop:"1px solid var(--border)"}}>
            <div style={{fontFamily:"var(--wk-heading-font)",fontSize:14,letterSpacing:"0.04em",color:"var(--orange)",marginBottom:8}}>
              Fixture mappings
            </div>
            <div style={{marginBottom:8}}>
              <select
                value={selectedCompetitionId}
                onChange={function(e){ setSelectedCompetitionId(e.target.value); }}
                style={{margin:0,maxWidth:300}}
              >
                <option value="">Select competition</option>
                {competitions.map(function(c) {
                  return <option key={c.id} value={String(c.id)}>{c.name} ({c.slug})</option>;
                })}
              </select>
            </div>
            {selectedCompetitionId ? (
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:320,overflow:"auto"}}>
                {fixtureMappings.map(function(m) {
                  return (
                    <div key={m.id} style={{display:"grid",gridTemplateColumns:"140px 80px 1fr",gap:8,alignItems:"center",fontSize:12,padding:"6px 8px",background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:8}}>
                      <code>{m.local_key}</code>
                      <span style={{color:"var(--fg-muted)"}}>{m.stage}</span>
                      <code style={{margin:0,color:"var(--fg)",opacity:m.api_fixture_id != null ? 1 : 0.5}}>
                        {m.api_fixture_id != null && m.api_fixture_id !== "" ? String(m.api_fixture_id) : "—"}
                      </code>
                    </div>
                  );
                })}
                {fixtureMappings.length === 0 ? <div style={{fontSize:12,color:"var(--fg-muted)"}}>No fixture mappings found.</div> : null}
              </div>
            ) : (
              <div style={{fontSize:12,color:"var(--fg-muted)"}}>Choose a competition to manage mappings.</div>
            )}
          </div>
        </div>
      )}

      {/* Logout confirmation modal */}
      {confirmLogout && (
        <div className="modal-backdrop" onClick={function(){setConfirmLogout(false);}}>
          <div className="modal" onClick={function(e){e.stopPropagation();}} style={{maxWidth:380}}>
            <div className="modal-title">{t.logout}?</div>
            <div style={{color:"var(--fg-muted)",fontSize:14,marginBottom:18}}>
              {t.confirmLogout || "Weet je zeker dat je wilt uitloggen uit het beheerpaneel?"}
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button className="btn btn-outline" onClick={function(){setConfirmLogout(false);}}>
                {t.cancel || "Annuleren"}
              </button>
              <button className="btn" onClick={doLogout}>{t.logout}</button>
            </div>
          </div>
        </div>
      )}

      {/* Competition delete confirmation modal */}
      {confirmDeleteCompetition && (
        <div className="modal-backdrop" onClick={function(){ if (!competitionBusy) setConfirmDeleteCompetition(null); }}>
          <div className="modal" onClick={function(e){e.stopPropagation();}} style={{maxWidth:420}}>
            <div className="modal-title">Delete competition?</div>
            <div style={{color:"var(--fg-muted)",fontSize:14,marginBottom:18,lineHeight:1.5}}>
              This will delete <strong>{confirmDeleteCompetition.name || confirmDeleteCompetition.slug || "the competition"}</strong> and related participants/matches/mappings via database cascade rules.
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button className="btn btn-outline" onClick={function(){setConfirmDeleteCompetition(null);}} disabled={competitionBusy}>
                {t.cancel || "Cancel"}
              </button>
              <button
                className="btn"
                style={{background:"#EF4444"}}
                onClick={function(){ deleteCompetition(confirmDeleteCompetition); }}
                disabled={competitionBusy}
              >
                {competitionBusy ? "…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
