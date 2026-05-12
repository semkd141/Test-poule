"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useApp, computeTotalPoints } from "../poule-context.jsx";
import { PHOTOS } from "./constants.js";
import {
  listPublicCompetitions,
  readSelectedCompetition,
  WK_SELECTED_COMPETITION_EVENT,
} from "../../../lib/wk/api-client";

function pickDefaultCompetitionId(rows) {
  if (!rows.length) return null;
  const sess = readSelectedCompetition();
  if (sess && rows.some(function (c) { return c.id === sess.id; })) return sess.id;
  return rows[0].id;
}

function participantBelongsToCompetition(p, competitionId) {
  if (competitionId == null || !Number.isFinite(Number(competitionId))) return false;
  var raw = p.competition_id;
  if (raw == null || raw === "") return false;
  return Number(raw) === Number(competitionId);
}

export function RankingTab() {
  const { participants, t, loading } = useApp();
  const m2 = t.matches2Tab || {};
  const rTab = t.rankingTab || {};
  const [competitions, setCompetitions] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [competitionId, setCompetitionId] = useState(null);

  useEffect(function () {
    listPublicCompetitions()
      .then(function (rows) {
        setCompetitions(Array.isArray(rows) ? rows : []);
      })
      .catch(function () {
        setCompetitions([]);
      })
      .finally(function () {
        setListLoading(false);
      });
  }, []);

  useEffect(function () {
    function onWk() {
      var sess = readSelectedCompetition();
      if (!sess || !competitions.some(function (c) { return c.id === sess.id; })) return;
      setCompetitionId(sess.id);
    }
    window.addEventListener(WK_SELECTED_COMPETITION_EVENT, onWk);
    return function () {
      window.removeEventListener(WK_SELECTED_COMPETITION_EVENT, onWk);
    };
  }, [competitions]);

  var resolvedCompetitionId = useMemo(function () {
    if (
      competitionId != null &&
      competitions.some(function (c) { return c.id === competitionId; })
    ) {
      return competitionId;
    }
    return pickDefaultCompetitionId(competitions);
  }, [competitionId, competitions]);

  var selectedCompetition = useMemo(function () {
    return competitions.find(function (c) { return c.id === resolvedCompetitionId; }) || null;
  }, [competitions, resolvedCompetitionId]);

  function attackerGoalsTieBreak(p) {
    if (p && p.attacker_goals !== undefined && p.attacker_goals !== null) {
      return Number(p.attacker_goals) || 0;
    }
    var spelers = p && p.spelers;
    if (typeof spelers === "string") {
      try { spelers = JSON.parse(spelers); } catch (e) { spelers = []; }
    }
    if (!Array.isArray(spelers)) return 0;
    return spelers.reduce(function (sum, sp) {
      var pos = String((sp && sp.positie) || "").toLowerCase();
      var isAtt = pos === "att" || pos === "aanvaller" || pos === "forward" || pos === "striker";
      return sum + (isAtt ? (Number(sp.goals) || 0) : 0);
    }, 0);
  }

  const forPool = useMemo(function () {
    if (resolvedCompetitionId == null) return [];
    return participants.filter(function (p) {
      return participantBelongsToCompetition(p, resolvedCompetitionId);
    });
  }, [participants, resolvedCompetitionId]);

  const ranked = useMemo(function () {
    return forPool.map(function (p) {
      return Object.assign({}, p, {
        totalPts: (p.total_points !== undefined && p.total_points !== null)
          ? (Number(p.total_points) || 0)
          : computeTotalPoints(p),
        attGoalsTie: attackerGoalsTieBreak(p),
      });
    }).sort(function (a, b) {
      if (b.totalPts !== a.totalPts) return b.totalPts - a.totalPts;
      if (b.attGoalsTie !== a.attGoalsTie) return b.attGoalsTie - a.attGoalsTie;
      return String(a.teamnaam || "").localeCompare(String(b.teamnaam || ""));
    });
  }, [forPool]);

  if (listLoading) return <div className="spinner"></div>;

  if (!competitions.length) {
    return (
      <div className="card" style={{ color: "var(--fg-muted)", fontSize: 14 }}>
        {m2.noCompetitionsList || "No competitions available."}
      </div>
    );
  }

  if (loading) return <div className="spinner"></div>;

  if (ranked.length === 0) {
    return (
      <React.Fragment>
        <div
          className="card"
          style={{
            marginBottom: 16,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
          }}
        >
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-muted)", minWidth: 120 }}>
            {m2.selectCompetition || "Competition"}
          </label>
          <select
            style={{
              flex: "1 1 220px",
              minWidth: 200,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg-2)",
              color: "var(--fg)",
              fontSize: 14,
            }}
            value={resolvedCompetitionId != null ? String(resolvedCompetitionId) : ""}
            onChange={function (e) {
              var v = e.target.value;
              setCompetitionId(v ? Number(v) : null);
            }}
          >
            {competitions.map(function (c) {
              var label = (c.name && String(c.name).trim() ? c.name : c.slug) || "—";
              if (c.slug && c.slug !== label) label = label + " (" + c.slug + ")";
              return (
                <option key={String(c.id)} value={String(c.id)}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
        <div className="card">
          <div className="empty-state">
            <img src={PHOTOS.trophy} alt="" className="empty-state-photo" onError={function (e) { e.target.style.display = "none"; }} />
            <div>{rTab.emptyForPool || t.noParticipants}</div>
            {selectedCompetition && selectedCompetition.name ? (
              <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 8 }}>
                {selectedCompetition.name}
              </div>
            ) : null}
          </div>
        </div>
      </React.Fragment>
    );
  }

  const first = ranked[0], second = ranked[1], third = ranked[2];

  return (
    <React.Fragment>
      <div
        className="card"
        style={{
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
        }}
      >
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-muted)", minWidth: 120 }}>
          {m2.selectCompetition || "Competition"}
        </label>
        <select
          style={{
            flex: "1 1 220px",
            minWidth: 200,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg-2)",
            color: "var(--fg)",
            fontSize: 14,
          }}
          value={resolvedCompetitionId != null ? String(resolvedCompetitionId) : ""}
          onChange={function (e) {
            var v = e.target.value;
            setCompetitionId(v ? Number(v) : null);
          }}
        >
          {competitions.map(function (c) {
            var label = (c.name && String(c.name).trim() ? c.name : c.slug) || "—";
            if (c.slug && c.slug !== label) label = label + " (" + c.slug + ")";
            return (
              <option key={String(c.id)} value={String(c.id)}>
                {label}
              </option>
            );
          })}
        </select>
      </div>
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
          {ranked.map(function (p, i) {
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
    3: "sepia(1) saturate(2) hue-rotate(-15deg) brightness(0.85) drop-shadow(0 4px 10px rgba(176,141,87,0.5))",
  };
  return (
    <div className={"podium-step " + props.cls}>
      <div className="podium-trophy">
        <img
          src={PHOTOS.trophy}
          alt={"#" + props.rank}
          style={{ height: isWinner ? 70 : 56, width: "auto", filter: trophyFilters[props.rank] }}
          onError={function (e) { e.target.style.display = "none"; }}
        />
      </div>
      <div className="podium-rank">#{props.rank}</div>
      <div className="podium-name">{props.step.naam}</div>
      <div className="podium-team">{props.step.teamnaam}</div>
      <div className="podium-points">{props.step.totalPts} <span style={{ fontSize: "12px", opacity: 0.6 }}>{t.pts}</span></div>
    </div>
  );
}
