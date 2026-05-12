"use client";

import React, { useState, useMemo } from "react";
import { useApp } from "../poule-context.jsx";
import { GROUPS, GROUP_MATCHES, KNOCKOUT } from "../../../lib/wk/tournament";
import { getTimezoneBannerInfo, WC2026_SCHEDULE_IANA } from "../../../lib/wk/competition-timezone";
import { formatDateLocalized } from "../../../lib/wk/datetime";

export function MatchesTab() {
  const { t } = useApp();
  const [sub, setSub] = useState("schedule");
  return (
    <React.Fragment>
      <div className="card" style={{marginBottom:16, display:"flex", gap:8, flexWrap:"wrap"}}>
        <button className={"tab " + (sub==="schedule"?"active":"")} onClick={function(){setSub("schedule");}}>{t.matchSchedule}</button>
        <button className={"tab " + (sub==="groups"?"active":"")} onClick={function(){setSub("groups");}}>{t.groups}</button>
        <button className={"tab " + (sub==="knockout"?"active":"")} onClick={function(){setSub("knockout");}}>{t.knockout}</button>
      </div>
      {sub === "schedule" && <ScheduleView />}
      {sub === "groups" && <GroupsView />}
      {sub === "knockout" && <KnockoutView />}
    </React.Fragment>
  );
}

function ScheduleView() {
  const { lang, t } = useApp();
  const m2 = t.matches2Tab || {};
  const scheduleTz = WC2026_SCHEDULE_IANA;

  const currentTzInfo = getTimezoneBannerInfo(scheduleTz);

  const grouped = useMemo(function() {
    const map = new Map();
    GROUP_MATCHES.forEach(function(mt) {
      const info = formatDateLocalized(mt.date, mt.time, lang, scheduleTz);
      const key = info.dateObj.toISOString().slice(0,10) + "|" + info.dateLabel;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(mt);
    });
    return Array.from(map.entries()).sort(function(a, b) { return a[0].localeCompare(b[0]); });
  }, [lang, scheduleTz]);

  return (
    <React.Fragment>
      <div style={{
        background:"linear-gradient(135deg, rgba(255,107,0,0.12), rgba(255,107,0,0.04))",
        border:"1px solid var(--orange)",
        borderRadius:12,
        padding:"12px 16px",
        marginBottom:16,
        display:"flex",
        alignItems:"center",
        gap:12,
        flexWrap:"wrap"
      }}>
        <span style={{fontSize:22}}>🕐</span>
        <div style={{flex:1, minWidth:160}}>
          <div style={{fontSize:10,letterSpacing:"0.15em",color:"var(--orange)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{t.timezoneInfo}</div>
          <div style={{fontFamily:"var(--wk-heading-font)",fontSize:18,letterSpacing:"0.05em"}}>
            {currentTzInfo.flag} {currentTzInfo.label}
            {currentTzInfo.short ? " (" + currentTzInfo.short + ")" : ""}
          </div>
        </div>
        <div style={{fontSize:11,color:"var(--fg-muted)",fontStyle:"italic"}}>
          {m2.competitionScheduleNote || "Times use this competition’s official schedule timezone."}
        </div>
      </div>
      {grouped.map(function(entry) {
        const key = entry[0], matches = entry[1];
        const dateLabel = key.split("|")[1];
        return (
          <div key={key}>
            <div className="match-date-header">{dateLabel}</div>
            {matches.slice().sort(function(a, b) {
              return formatDateLocalized(a.date,a.time,lang,scheduleTz).dateObj - formatDateLocalized(b.date,b.time,lang,scheduleTz).dateObj;
            }).map(function(mt, i) { return <MatchRow key={i} match={mt} />; })}
          </div>
        );
      })}
    </React.Fragment>
  );
}

function MatchRow(props) {
  const { lang, t } = useApp();
  const info = formatDateLocalized(props.match.date, props.match.time, lang, WC2026_SCHEDULE_IANA);
  return (
    <div className="match-row">
      <div><div className="match-team left">{props.match.home}</div></div>
      <div style={{textAlign:"center"}}>
        <div className="match-vs">{info.timeLabel}</div>
        <div className="match-meta">
          <span className="badge">{t.groupLabel} {props.match.group}</span>
          <span>📍 {props.match.city}</span>
        </div>
      </div>
      <div><div className="match-team right">{props.match.away}</div></div>
    </div>
  );
}

function GroupsView() {
  const { t } = useApp();
  return (
    <div className="groups-grid">
      {Object.entries(GROUPS).map(function(entry) {
        const letter = entry[0], teams = entry[1];
        return (
          <div key={letter} className="group-card">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <div className="group-letter" style={{margin:0}}>{letter}</div>
              <div style={{fontFamily:"var(--wk-heading-font)",fontSize:18,color:"var(--fg-muted)",letterSpacing:"0.1em",textTransform:"uppercase"}}>{t.groupLabel} {letter}</div>
            </div>
            {teams.map(function(team) {
              return (
                <div key={team} className="group-team">
                  <span>{team}</span>
                  <span style={{color:"var(--fg-muted)",fontSize:12}}>—</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function KnockoutView() {
  const { t } = useApp();
  return (
    <div className="card">
      <div className="card-title">{t.knockout}</div>
      <div style={{fontSize:13,color:"var(--fg-muted)",marginBottom:18,padding:"12px 16px",background:"var(--bg-3)",borderRadius:10,borderLeft:"3px solid var(--orange)"}}>
        {t.knockoutInfo || "De knockout-wedstrijden worden ingevuld zodra de groepsfase is afgelopen."}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:16}}>
        {KNOCKOUT.map(function(k) {
          return (
            <div key={k.stage} className="group-card" style={{textAlign:"center"}}>
              <div className="group-letter" style={{width:"auto",padding:"0 14px",marginBottom:8}}>{t[k.stage]}</div>
              <div style={{color:"var(--fg-muted)",fontSize:13}}>{k.matches} {k.matches === 1 ? "match" : "matches"}</div>
              <div style={{fontSize:12,marginTop:6,opacity:0.5,fontStyle:"italic"}}>{t.tbd || "TBD"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
