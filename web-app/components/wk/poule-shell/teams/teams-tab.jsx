"use client";

import React, { useState } from "react";
import { useApp } from "../../poule-context.jsx";
import { PHOTOS } from "../constants.js";
import { TeamCard } from "./team-card.jsx";

export function TeamsTab() {
  const { participants, t, loading } = useApp();
  const [search, setSearch] = useState("");

  if (loading) return <div className="spinner"></div>;
  if (participants.length === 0) return (
    <div className="card">
      <div className="empty-state">
        <img src={PHOTOS.trophy} alt="" className="empty-state-photo" onError={function(e){e.target.style.display="none";}} />
        <div>{t.noTeamsYet}</div>
      </div>
    </div>
  );

  const q = search.trim().toLowerCase();
  const filtered = q === "" ? participants : participants.filter(function(p) {
    const teamMatch = (p.teamnaam || "").toLowerCase().indexOf(q) !== -1;
    const nameMatch = (p.naam || "").toLowerCase().indexOf(q) !== -1;
    return teamMatch || nameMatch;
  });

  return (
    <React.Fragment>
      <div style={{marginBottom:16,position:"relative"}}>
        <input
          type="text"
          placeholder={t.searchPlaceholder || "Zoek team..."}
          value={search}
          onChange={function(e){setSearch(e.target.value);}}
          style={{margin:0,paddingLeft:42,paddingRight:search ? 42 : 14}}
        />
        <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:18,opacity:0.5,pointerEvents:"none"}}>🔎</span>
        {search && (
          <button
            type="button"
            onClick={function(){setSearch("");}}
            style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",fontSize:18,opacity:0.6,cursor:"pointer",padding:6,color:"var(--fg)"}}
            aria-label="Clear"
          >✕</button>
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="card"><div className="empty-state">Geen teams gevonden voor "{search}"</div></div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))",gap:16}}>
          {filtered.map(function(p) { return <TeamCard key={p.id} participant={p} />; })}
        </div>
      )}
    </React.Fragment>
  );
}

// Aanvoerdersband SVG component
