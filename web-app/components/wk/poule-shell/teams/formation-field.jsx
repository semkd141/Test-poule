"use client";

import React from "react";
import { FORMATIONS, flag } from "../../../../lib/wk/tournament";
import { useApp } from "../../poule-context.jsx";
import { CaptainBand } from "./captain-band.jsx";
export function FormationField(props) {
  const { t } = useApp();
  const f = FORMATIONS[props.system] || FORMATIONS["4-3-3"];
  const spelers = props.spelers || [];
  const keepers = spelers.filter(function(s) { return s.positie === "keeper"; });
  const defs = spelers.filter(function(s) { return s.positie === "def"; });
  const mids = spelers.filter(function(s) { return s.positie === "mid"; });
  const atts = spelers.filter(function(s) { return s.positie === "att"; });
  const coach = spelers.filter(function(s) { return s.positie === "coach"; })[0];

  function Slot(ps) {
    const sp = ps.sp;
    const isCaptain = sp && sp.aanvoerder;
    return (
      <div className={"pos-slot " + (sp ? "filled" : "")} style={isCaptain ? {border:"2px solid #FFD700",boxShadow:"0 0 8px rgba(255,215,0,0.4)"} : {}}>
        {isCaptain && (
          <div style={{position:"absolute",top:-10,right:4,zIndex:3}}>
            <CaptainBand size={32}/>
          </div>
        )}
        <div className="pos-slot-label">{ps.label}</div>
        {sp ? (
          sp.spelerNaam && sp.spelerNaam.trim() ? (
            <React.Fragment>
              <div className="pos-slot-name">{sp.spelerNaam}</div>
              <div className="pos-slot-country-line">
                <span className="pos-slot-flag-inline">{flag(sp.land)}</span>
                <span className="pos-slot-country">{sp.land}</span>
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div className="pos-slot-name">{sp.land}</div>
              <div className="pos-slot-country-line">
                <span className="pos-slot-flag-inline">{flag(sp.land)}</span>
              </div>
            </React.Fragment>
          )
        ) : (
          <div className="pos-slot-country" style={{opacity:0.5}}>—</div>
        )}
      </div>
    );
  }

  return (
    <React.Fragment>
      <div className="squad-formation">
        {/* Football field decorations - bottom half only (own half) */}
        <div className="field-corner bl"></div>
        <div className="field-corner br"></div>
        <div className="field-pen-bot"></div>
        <div className="field-goal-bot"></div>
        <div className="field-pen-arc-bot"></div>
        <div className="field-spot bot"></div>
        <div className="field-center"></div>

        {/* Player slots - aanvallers near halfway line, keeper near goal */}
        <div className="pos-row">
          {atts.map(function(sp, i) { return <Slot key={"a"+i} sp={sp} label={t.pos.att} />; })}
          {atts.length === 0 && Array(f.att).fill(0).map(function(_, i) { return <Slot key={"ae"+i} label={t.pos.att} />; })}
        </div>
        <div className="pos-row">
          {mids.map(function(sp, i) { return <Slot key={"m"+i} sp={sp} label={t.pos.mid} />; })}
          {mids.length === 0 && Array(f.mid).fill(0).map(function(_, i) { return <Slot key={"me"+i} label={t.pos.mid} />; })}
        </div>
        <div className="pos-row">
          {defs.map(function(sp, i) { return <Slot key={"d"+i} sp={sp} label={t.pos.def} />; })}
          {defs.length === 0 && Array(f.def).fill(0).map(function(_, i) { return <Slot key={"de"+i} label={t.pos.def} />; })}
        </div>
        <div className="pos-row">
          {keepers.map(function(sp, i) { return <Slot key={"k"+i} sp={sp} label={t.pos.keeper} />; })}
          {keepers.length === 0 && <Slot label={t.pos.keeper} />}
        </div>
      </div>
      {coach && (coach.spelerNaam || coach.land) && (
        <div style={{marginTop:14, display:"flex", justifyContent:"center"}}>
          <div className="pos-slot filled" style={{width:220,background:"linear-gradient(135deg,#FFD700,#FFA500)",color:"#18181B",padding:"10px 14px"}}>
            <div className="pos-slot-label">{t.pos.coach}</div>
            <div className="pos-slot-name">{coach.spelerNaam || coach.land || "—"}</div>
            {coach.land && !coach.spelerNaam && (
              <div className="pos-slot-country-line">
                <span className="pos-slot-flag-inline">{flag(coach.land)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
