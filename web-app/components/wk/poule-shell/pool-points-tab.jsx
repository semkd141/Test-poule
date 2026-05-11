"use client";

import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { useApp } from "../poule-context.jsx";
import {
  authGetValidSession,
  authLoadSession,
  myListCompetitions,
  myListCompetitionParticipants,
} from "../../../lib/wk/api-client";
import { AdminRow } from "./admin/admin-row.jsx";

function parseSpelersField(row) {
  const raw = row.spelers;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function initialSessionFromStorage() {
  var s = authLoadSession();
  return s && s.access_token ? s : null;
}

export function PoolPointsTab() {
  const { t, setTab } = useApp();
  const tc = t.competitionTab || {};
  const [session, setSession] = useState(initialSessionFromStorage);
  /** False once we've reconciled with `authGetValidSession` (avoids spinner when token already in storage). */
  const [sessionResolving, setSessionResolving] = useState(function() {
    return !initialSessionFromStorage();
  });
  const [competitions, setCompetitions] = useState([]);
  /** False until first `myListCompetitions` for this session finishes (avoids a "no pools" flash). */
  const [competitionsReady, setCompetitionsReady] = useState(function() {
    return !initialSessionFromStorage();
  });
  const [selectedId, setSelectedId] = useState("");
  const [poolParticipants, setPoolParticipants] = useState([]);

  useEffect(function() {
    var cancelled = false;
    (async function() {
      try {
        var s = await authGetValidSession();
        if (cancelled) return;
        setSession(s && s.access_token ? s : null);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setSessionResolving(false);
      }
    })();
    return function() {
      cancelled = true;
    };
  }, []);

  useEffect(function() {
    if (!session) {
      setCompetitions([]);
      setCompetitionsReady(true);
      return;
    }
    var cancelled = false;
    setCompetitionsReady(false);
    myListCompetitions()
      .then(function(rows) {
        if (cancelled) return;
        setCompetitions(Array.isArray(rows) ? rows : []);
      })
      .catch(function(e) {
        console.error("myListCompetitions", e);
        if (!cancelled) setCompetitions([]);
      })
      .finally(function() {
        if (!cancelled) setCompetitionsReady(true);
      });
    return function() {
      cancelled = true;
    };
  }, [session]);

  useEffect(function() {
    if (!selectedId || !session) {
      setPoolParticipants([]);
      return;
    }
    (async function() {
      try {
        const rows = await myListCompetitionParticipants(selectedId);
        const list = Array.isArray(rows) ? rows : [];
        setPoolParticipants(
          list.map(function(r) {
            return Object.assign({}, r, { spelers: parseSpelersField(r) });
          }),
        );
      } catch (e) {
        console.error(e);
        setPoolParticipants([]);
      }
    })();
  }, [selectedId, session]);

  useEffect(function() {
    if (competitions.length === 0) {
      setSelectedId("");
      return;
    }
    setSelectedId(function(prev) {
      if (prev && competitions.some(function(c) { return String(c.id) === String(prev); })) {
        return prev;
      }
      return String(competitions[0].id);
    });
  }, [competitions]);

  function exportExcel() {
    const rows = [];
    poolParticipants.forEach(function(p) {
      let sp = p.spelers;
      if (typeof sp === "string") {
        try {
          sp = JSON.parse(sp);
        } catch {
          sp = [];
        }
      }
      if (!Array.isArray(sp)) sp = [];
      const totalPts = sp.reduce(function(s, x) {
        return s + (Number(x.punten) || 0);
      }, 0);
      rows.push({
        Naam: p.naam,
        Teamnaam: p.teamnaam,
        Email: p.email,
        Systeem: p.systeem,
        TotaalPunten: totalPts,
        Spelers: sp
          .map(function(x) {
            if (x.positie === "coach") return "coach:" + (x.spelerNaam || "?") + " [" + (x.punten || 0) + "pt]";
            return (
              x.positie +
              ":" +
              (x.spelerNaam || x.land || "?") +
              (x.land && x.spelerNaam ? " (" + x.land + ")" : "") +
              " [" +
              (x.punten || 0) +
              "pt]"
            );
          })
          .join(" | "),
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    const sheetName = "pool";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const comp = competitions.find(function(c) {
      return String(c.id) === String(selectedId);
    });
    const slug = comp && comp.slug ? String(comp.slug).replace(/[^a-z0-9_-]/gi, "_") : "pool";
    XLSX.writeFile(wb, "wk_poule_" + slug + ".xlsx");
  }

  async function reloadPoolParticipants() {
    if (!selectedId || !session) return;
    try {
      const rows = await myListCompetitionParticipants(selectedId);
      const list = Array.isArray(rows) ? rows : [];
      setPoolParticipants(
        list.map(function(r) {
          return Object.assign({}, r, { spelers: parseSpelersField(r) });
        }),
      );
    } catch (e) {
      console.error(e);
    }
  }

  if (sessionResolving) {
    return <div className="spinner"></div>;
  }

  if (!session) {
    return (
      <div className="card">
        <div className="card-title" style={{ fontSize: 20 }}>
          {t.pointsManagement || "Manage Points "}
        </div>
        <p style={{ color: "var(--fg-muted)", marginBottom: 16, lineHeight: 1.5 }}>
          {tc.signInHint ||
            "Sign in first (use Register or My Team) to manage points for teams in pools you created."}
        </p>
        <button type="button" className="btn" onClick={function() { setTab("edit"); }}>
          {tc.goToMyTeam || "My Team / sign in"}
        </button>
      </div>
    );
  }

  if (session && !competitionsReady) {
    return <div className="spinner"></div>;
  }

  if (competitions.length === 0) {
    return (
      <div className="card">
        <div className="card-title" style={{ fontSize: 20 }}>
          {t.pointsManagement || "Manage Points"}
        </div>
        <p style={{ color: "var(--fg-muted)", lineHeight: 1.5 }}>
          {tc.noPoolsYet || "No pools yet — create one under Competition, then manage points here."}
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title" style={{ justifyContent: "space-between", display: "flex", flexWrap: "wrap", gap: 10 }}>
        <span>{t.pointsManagement || "Manage Points"}</span>
        <button type="button" className="btn" onClick={exportExcel}>
          📊 {t.exportExcel}
        </button>
      </div>
      <p style={{ color: "var(--fg-muted)", fontSize: 13, marginBottom: 14, lineHeight: 1.45 }}>
        {t.poolPointsHint ||
          "Edit points and squads for teams registered in your pool. The registration deadline for the whole site is only configurable in the Admin tab (superadmin)."}
      </p>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, marginBottom: 6, color: "var(--fg-muted)" }}>
          {t.poolPointsSelectPool || "Your pool"}
        </label>
        <select
          value={selectedId}
          onChange={function(e) {
            setSelectedId(e.target.value);
          }}
          style={{ margin: 0, maxWidth: "100%", width: "min(420px, 100%)" }}
        >
          {competitions.map(function(c) {
            return (
              <option key={c.id} value={String(c.id)}>
                {c.name} ({c.slug})
              </option>
            );
          })}
        </select>
      </div>
      {poolParticipants.length === 0 ? (
        <div className="empty-state">{t.noParticipants}</div>
      ) : (
        poolParticipants.map(function(p) {
          return <AdminRow key={p.id} participant={p} onReload={reloadPoolParticipants} />;
        })
      )}
    </div>
  );
}
