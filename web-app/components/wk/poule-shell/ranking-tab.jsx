"use client";

import React, { useMemo } from "react";
import { useApp, computeTotalPoints } from "../poule-context.jsx";
import { PHOTOS } from "./constants.js";

export function RankingTab() {
  const { participants, t, loading } = useApp();
  function attackerGoalsTieBreak(p) {
    if (p && p.attacker_goals !== undefined && p.attacker_goals !== null) {
      return Number(p.attacker_goals) || 0;
    }
    var spelers = p && p.spelers;
    if (typeof spelers === "string") {
      try { spelers = JSON.parse(spelers); } catch (e) { spelers = []; }
    }
    if (!Array.isArray(spelers)) return 0;
    return spelers.reduce(function(sum, sp) {
      var pos = String((sp && sp.positie) || "").toLowerCase();
      var isAtt = pos === "att" || pos === "aanvaller" || pos === "forward" || pos === "striker";
      return sum + (isAtt ? (Number(sp.goals) || 0) : 0);
    }, 0);
  }
  const ranked = useMemo(function() {
    return participants.map(function(p) {
      return Object.assign({}, p, {
        totalPts: (p.total_points !== undefined && p.total_points !== null)
          ? (Number(p.total_points) || 0)
          : computeTotalPoints(p),
        attGoalsTie: attackerGoalsTieBreak(p)
      });
    }).sort(function(a, b) {
      if (b.totalPts !== a.totalPts) return b.totalPts - a.totalPts;
      if (b.attGoalsTie !== a.attGoalsTie) return b.attGoalsTie - a.attGoalsTie;
      return String(a.teamnaam || "").localeCompare(String(b.teamnaam || ""));
    });
  }, [participants]);

  if (loading) return <div className="spinner"></div>;
  if (ranked.length === 0) return (
    <div className="card">
      <div className="empty-state">
        <img src={PHOTOS.trophy} alt="" className="empty-state-photo" onError={function(e){e.target.style.display="none";}} />
        <div>{t.noParticipants}</div>
      </div>
    </div>
  );

  const first = ranked[0], second = ranked[1], third = ranked[2];

  return (
    <React.Fragment>
      {ranked.length >= 1 && (
        <div className="podium">
          {second ? <PodiumStep step={second} rank={2} cls="silver" /> : <div />}
          <PodiumStep step={first} rank={1} cls="gold" />
          {third ? <PodiumStep step={third} rank={3} cls="bronze" /> : <div />}
        </div>
      )}
      <div className="card">
        <div className="card-title">{t.tabs.ranking}</div>
        <div className="rank-list">
          {ranked.map(function(p, i) {
            return (
              <div className="rank-row" key={p.id}>
                <div className="rank-num">{i + 1}</div>
                <div className="rank-name">{p.naam}</div>
                <div className="rank-team">{p.teamnaam}</div>
                <div className="rank-pts">{p.totalPts}</div>
              </div>
            );
          })}
        </div>
      </div>
    </React.Fragment>
  );
}

function PodiumStep(props) {
  const { t } = useApp();
  const isWinner = props.rank === 1;
  // Trophy color filter per rank
  const trophyFilters = {
    1: "drop-shadow(0 4px 12px rgba(255,215,0,0.6)) saturate(1.3)",
    2: "grayscale(1) brightness(1.4) contrast(0.85) drop-shadow(0 4px 10px rgba(192,192,192,0.5))",
    3: "sepia(1) saturate(2) hue-rotate(-15deg) brightness(0.85) drop-shadow(0 4px 10px rgba(176,141,87,0.5))"
  };
  return (
    <div className={"podium-step " + props.cls}>
      <div className="podium-trophy">
        <img
          src={PHOTOS.trophy}
          alt={"#" + props.rank}
          style={{height: isWinner ? 70 : 56, width:"auto", filter: trophyFilters[props.rank]}}
          onError={function(e){e.target.style.display="none";}}
        />
      </div>
      <div className="podium-rank">#{props.rank}</div>
      <div className="podium-name">{props.step.naam}</div>
      <div className="podium-team">{props.step.teamnaam}</div>
      <div className="podium-points">{props.step.totalPts} <span style={{fontSize:"12px",opacity:0.6}}>{t.pts}</span></div>
    </div>
  );
}
