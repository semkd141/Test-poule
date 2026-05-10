"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { FORMATIONS } from "../../../../lib/wk/tournament";
import { dbBijwerkenSpelers, dbBijwerkenVeld, dbVerwijderParticipant } from "../../../../lib/wk/api-client";
import { toastError } from "../../../../lib/wk/toast";
import { useApp } from "../../poule-context.jsx";
import { CaptainBand } from "../teams/captain-band.jsx";

export function AdminRow(props) {
  const { t, wkSpelers } = useApp();
  let initial = props.participant.spelers;
  if (typeof initial === "string") { try { initial = JSON.parse(initial); } catch { initial = []; } }
  if (!Array.isArray(initial)) initial = [];
  const initialNormalized = initial.map(function(x) { return Object.assign({}, x, { punten: Number(x.punten) || 0 }); });

  const [local, setLocal] = useState(initialNormalized);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initialNormalized.map(function(x){return x.punten;})));
  const [savingPoints, setSavingPoints] = useState(false);
  const [pointsSaved, setPointsSaved] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editTeamnaam, setEditTeamnaam] = useState(props.participant.teamnaam || "");
  const [editNaam, setEditNaam] = useState(props.participant.naam || "");
  const [editSysteem, setEditSysteem] = useState(props.participant.systeem || "4-3-3");
  const [editSpelers, setEditSpelers] = useState(initialNormalized.slice());
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

  // wkSpelers lookup for player dropdowns in edit mode
  const spelersByLandPos = useMemo(function() {
    const m = {};
    (wkSpelers || []).forEach(function(s) {
      const k = s.land + "|" + s.positie;
      if (!m[k]) m[k] = [];
      m[k].push(s);
    });
    return m;
  }, [wkSpelers]);

  useEffect(function() {
    const norm = initial.map(function(x) { return Object.assign({}, x, { punten: Number(x.punten) || 0 }); });
    setLocal(norm);
    setSavedSnapshot(JSON.stringify(norm.map(function(x){return x.punten;})));
  }, [props.participant.id, props.participant.spelers]);

  useEffect(function() {
    if (props.saved) {
      setSavedSnapshot(JSON.stringify(local.map(function(x){return x.punten;})));
    }
  }, [props.saved]);

  function updatePts(i, val) {
    setLocal(function(prev) {
      return prev.map(function(x, idx) {
        return idx === i ? Object.assign({}, x, { punten: Number(val) || 0 }) : x;
      });
    });
  }

  const total = local.reduce(function(s, x) { return s + (Number(x.punten) || 0); }, 0);
  const currentSnapshot = JSON.stringify(local.map(function(x){return x.punten;}));
  const isDirty = currentSnapshot !== savedSnapshot;

  async function savePoints() {
    setSavingPoints(true);
    try {
      await dbBijwerkenSpelers(props.participant.id, local);
      setSavedSnapshot(currentSnapshot);
      setPointsSaved(true);
      setTimeout(function(){ setPointsSaved(false); }, 1800);
      if (props.onReload) await props.onReload();
    } catch (e) {
      toastError("Error saving points: " + (e && e.message ? e.message : String(e)));
    } finally {
      setSavingPoints(false);
    }
  }

  useEffect(function() {
    setEditTeamnaam(props.participant.teamnaam || "");
    setEditNaam(props.participant.naam || "");
    setEditSysteem(props.participant.systeem || "4-3-3");
    let orig = props.participant.spelers;
    if (typeof orig === "string") { try { orig = JSON.parse(orig); } catch { orig = []; } }
    setEditSpelers(Array.isArray(orig) ? orig.map(function(x){ return Object.assign({},x,{punten:Number(x.punten)||0}); }) : []);
  }, [props.participant.id]);

  async function saveEdit() {
    if (!editTeamnaam.trim() || !editNaam.trim()) {
      toastError(t.fillRequired || "Fill in team name and name");
      return;
    }
    setSavingEdit(true);
    try {
      await dbBijwerkenVeld(props.participant.id, {
        teamnaam: editTeamnaam.trim(),
        naam: editNaam.trim(),
        systeem: editSysteem,
        spelers: JSON.stringify(editSpelers)
      });
      setEditSaved(true);
      setTimeout(function(){ setEditSaved(false); setEditing(false); }, 1200);
      if (props.onReload) await props.onReload();
    } catch (e) {
      toastError("Error: " + e.message);
    } finally {
      setSavingEdit(false);
    }
  }

  function cancelEdit() {
    setEditTeamnaam(props.participant.teamnaam || "");
    setEditNaam(props.participant.naam || "");
    setEditSysteem(props.participant.systeem || "4-3-3");
    // Reset spelers
    let orig = props.participant.spelers;
    if (typeof orig === "string") { try { orig = JSON.parse(orig); } catch { orig = []; } }
    setEditSpelers(Array.isArray(orig) ? orig.slice() : []);
    setEditing(false);
  }

  function handleSysteemChange(newSys) {
    const newF = FORMATIONS[newSys];
    if (!newF) return;
    setEditSysteem(newSys);
    // Rebuild spelers array to match new formation, keeping existing where possible
    const byPos = { keeper: [], def: [], mid: [], att: [], coach: [] };
    editSpelers.forEach(function(s) { if (byPos[s.positie]) byPos[s.positie].push(s); });
    // Trim or pad each position
    ["keeper","def","mid","att"].forEach(function(pos) {
      const target = pos === "keeper" ? 1 : newF[pos];
      while (byPos[pos].length < target) byPos[pos].push({ land:"", spelerNaam:"", positie:pos, punten:0 });
      byPos[pos] = byPos[pos].slice(0, target);
    });
    setEditSpelers([].concat(byPos.keeper, byPos.def, byPos.mid, byPos.att, byPos.coach));
  }

  return (
    <div className="group-card" style={{marginBottom:14, borderColor: isDirty ? "var(--orange)" : "var(--border)", transition:"border-color .2s"}}>
      {editing ? (
        <div style={{marginBottom:14, padding:"14px", background:"var(--bg-3)", borderRadius:10}}>
          <div className="settings-label" style={{marginBottom:10}}>{t.editTeam || "Edit team"}</div>
          {/* Basic info */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10, marginBottom:14}}>
            <div>
              <label style={{fontSize:11}}>{t.teamName || "Team name"}</label>
              <input type="text" value={editTeamnaam} onChange={function(e){setEditTeamnaam(e.target.value);}} style={{margin:0}} />
            </div>
            <div>
              <label style={{fontSize:11}}>{t.userName || "Name"}</label>
              <input type="text" value={editNaam} onChange={function(e){setEditNaam(e.target.value);}} style={{margin:0}} />
            </div>
            <div>
              <label style={{fontSize:11}}>{t.system || "Formation"}</label>
              <select value={editSysteem} onChange={function(e){ handleSysteemChange(e.target.value); }} style={{margin:0}}>
                {Object.keys(FORMATIONS).map(function(k){ return <option key={k} value={k}>{k}</option>; })}
              </select>
            </div>
          </div>
          {/* Players editor */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",color:"var(--orange)",marginBottom:8}}>Players</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {editSpelers.map(function(sp, i) {
                if (!sp) return null;
                const isCoach = sp.positie === "coach";
                const key = (sp.land || "") + "|" + sp.positie;
                const wkOptions = spelersByLandPos[key] || [];
                return (
                  <div key={i} style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",background:"white",borderRadius:8,padding:"8px 10px",border:"1px solid var(--border)"}}>
                    <span style={{width:75,flexShrink:0,fontSize:10,fontWeight:700,textTransform:"uppercase",color:"var(--orange)",letterSpacing:"0.04em"}}>
                      {t.pos[sp.positie] || sp.positie}
                    </span>
                    {/* Country/land */}
                    <input
                      type="text"
                      value={sp.land || ""}
                      placeholder="Country"
                      onChange={function(e){
                        setEditSpelers(function(prev){ const n=prev.slice(); n[i]=Object.assign({},n[i],{land:e.target.value}); return n; });
                      }}
                      style={{width:120,flexShrink:0,margin:0,fontSize:12,padding:"4px 8px"}}
                    />
                    {/* Player name */}
                    {!isCoach && wkOptions.length > 0 ? (
                      <select
                        value={sp.spelerNaam || ""}
                        onChange={function(e){
                          setEditSpelers(function(prev){ const n=prev.slice(); n[i]=Object.assign({},n[i],{spelerNaam:e.target.value}); return n; });
                        }}
                        style={{flex:1,margin:0,fontSize:12,padding:"4px 8px"}}
                      >
                        <option value="">— select —</option>
                        {wkOptions.map(function(o){ return <option key={o.id} value={o.naam}>{o.naam}</option>; })}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={sp.spelerNaam || ""}
                        placeholder={isCoach ? "Coach name" : "Player name"}
                        onChange={function(e){
                          setEditSpelers(function(prev){ const n=prev.slice(); n[i]=Object.assign({},n[i],{spelerNaam:e.target.value}); return n; });
                        }}
                        style={{flex:1,margin:0,fontSize:12,padding:"4px 8px"}}
                      />
                    )}
                    {/* Captain toggle */}
                    {!isCoach && (
                      <button
                        type="button"
                        title={sp.aanvoerder ? "Remove captain" : "Make captain"}
                        onClick={function(){
                          setEditSpelers(function(prev){
                            return prev.map(function(s,j){
                              return Object.assign({},s,{aanvoerder: j===i ? !s.aanvoerder : false});
                            });
                          });
                        }}
                        style={{background:"transparent",border:"none",cursor:"pointer",padding:"2px",flexShrink:0}}
                      >
                        <CaptainBand size={22} active={!!sp.aanvoerder}/>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
            <button className="btn btn-outline" onClick={cancelEdit} disabled={savingEdit}>{t.cancel || "Cancel"}</button>
            <button className="btn" onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? "…" : editSaved ? "✓ " + (t.saved || "Saved") : (t.save || "Save")}
            </button>
          </div>
        </div>
      ) : (
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontWeight:700, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
              <span>{props.participant.teamnaam}</span>
              <button
                onClick={function(){setEditing(true);}}
                aria-label="Edit"
                title={t.edit || "Edit"}
                style={{background:"transparent",border:"none",cursor:"pointer",fontSize:13,opacity:0.5,padding:"2px 6px",borderRadius:4,color:"var(--fg-muted)"}}
                onMouseEnter={function(e){e.target.style.opacity="1";e.target.style.color="var(--orange)";}}
                onMouseLeave={function(e){e.target.style.opacity="0.5";e.target.style.color="var(--fg-muted)";}}
              >✎</button>
              {/* Delete button */}
              <button
                onClick={async function(){
                  if (!window.confirm("Verwijder team '" + props.participant.teamnaam + "'? Dit kan niet ongedaan worden gemaakt.")) return;
                  try {
                    await dbVerwijderParticipant(props.participant.id);
                    if (props.onReload) await props.onReload();
                  } catch (e) {
                    toastError("Fout bij verwijderen: " + (e && e.message ? e.message : String(e)));
                  }
                }}
                title="Team verwijderen"
                style={{background:"transparent",border:"none",cursor:"pointer",fontSize:13,opacity:0.4,padding:"2px 6px",borderRadius:4,color:"#EF4444"}}
                onMouseEnter={function(e){e.target.style.opacity="1";}}
                onMouseLeave={function(e){e.target.style.opacity="0.4";}}
              >🗑</button>
              {savingPoints ? (
                <span style={{fontSize:11, padding:"2px 8px", background:"var(--bg-3)", color:"var(--fg-muted)", borderRadius:6, fontWeight:600, letterSpacing:"0.05em"}}>
                  {t.saving || "Saving…"}
                </span>
              ) : isDirty ? (
                <span style={{fontSize:11, padding:"2px 8px", background:"var(--orange)", color:"white", borderRadius:6, fontWeight:600, letterSpacing:"0.05em"}}>
                  {t.unsaved || "Unsaved"}
                </span>
              ) : pointsSaved ? (
                <span style={{fontSize:11, padding:"2px 8px", background:"#10B981", color:"white", borderRadius:6, fontWeight:600, letterSpacing:"0.05em"}}>
                  ✓ {t.saved}
                </span>
              ) : null}
            </div>
            <div style={{fontSize:12,color:"var(--fg-muted)"}}>{props.participant.naam} • {props.participant.systeem}</div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <span className="badge">Totaal: {total}</span>
            {isDirty ? (
              <button className="btn" onClick={savePoints} disabled={savingPoints}>
                {savingPoints ? "…" : (t.save || "Save")}
              </button>
            ) : null}
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))",gap:6}}>
        {local.map(function(sp, i) {
          const posLabel = t.pos[sp.positie] || sp.positie;
          return (
            <div key={i} className="admin-player">
              <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                <strong style={{color:"var(--orange)"}}>{posLabel}</strong>
                <span style={{color:"var(--fg-muted)"}}> · </span>
                {sp.positie === "coach" ? (
                  <span style={{fontWeight:600}}>{sp.spelerNaam || "—"}</span>
                ) : sp.spelerNaam && sp.spelerNaam.trim() ? (
                  <React.Fragment>
                    <span style={{fontWeight:600}}>{sp.spelerNaam}</span>
                    <span style={{color:"var(--fg-muted)",fontSize:"0.9em"}}> ({sp.land})</span>
                  </React.Fragment>
                ) : (
                  <span style={{fontWeight:600}}>{sp.land}</span>
                )}
              </span>
              <input
                type="number"
                className="admin-input-mini"
                value={sp.punten}
                onChange={function(e){updatePts(i, e.target.value);}}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
