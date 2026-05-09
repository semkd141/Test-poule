"use client";

import React, { useState } from "react";
import { ALL_COUNTRIES, flag } from "../../../lib/wk/tournament";
import { useApp } from "../poule-context.jsx";

export function CountryPicker(props) {
  const { t } = useApp();
  const [q, setQ] = useState("");
  const filtered = ALL_COUNTRIES.filter(function(c) { return c.toLowerCase().indexOf(q.toLowerCase()) !== -1; });

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={function(e){e.stopPropagation();}}>
        <div className="modal-title">{t.selectCountry}</div>
        <input placeholder="🔍" value={q} onChange={function(e){setQ(e.target.value);}} autoFocus />
        <div className="country-grid">
          {filtered.map(function(c) {
            const isTaken = props.taken.has(c);
            return (
              <button
                key={c}
                className="country-btn"
                disabled={isTaken}
                title={isTaken ? t.countryTaken : ""}
                onClick={function(){ if (!isTaken) props.onPick(c); }}
              >
                <span style={{fontSize:"1.2em",marginRight:4}}>{flag(c)}</span>{c}
              </button>
            );
          })}
        </div>
        <div style={{marginTop:12,textAlign:"end"}}>
          <button className="btn btn-outline" onClick={props.onClose}>{t.back}</button>
        </div>
      </div>
    </div>
  );
}
