"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "../poule-context.jsx";
import { PHOTOS } from "./constants.js";
import {
  listPublicCompetitions,
  readSelectedCompetition,
  writeSelectedCompetition,
  WK_SELECTED_COMPETITION_EVENT,
} from "../../../lib/wk/api-client";
import {
  getTimezoneBannerInfo,
  resolveScheduleTimezone,
} from "../../../lib/wk/competition-timezone";

function parseEventStart(iso) {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function pickDefaultCompetitionId(rows) {
  if (!rows.length) return null;
  const sess = readSelectedCompetition();
  if (sess && rows.some(function (c) {
    return c.id === sess.id;
  })) {
    return sess.id;
  }
  return rows[0].id;
}

export function ResultsTab() {
  const { t, lang, tz } = useApp();
  const m2 = t.matches2Tab || {};
  const [now, setNow] = useState(Date.now());
  const [competitions, setCompetitions] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [competitionId, setCompetitionId] = useState(null);

  useEffect(function () {
    const id = setInterval(function () {
      setNow(Date.now());
    }, 1000);
    return function () {
      clearInterval(id);
    };
  }, []);

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
    if (!competitions.length) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- default pool when list loads */
    setCompetitionId(function (prev) {
      if (prev != null && competitions.some(function (c) {
        return c.id === prev;
      })) {
        return prev;
      }
      return pickDefaultCompetitionId(competitions);
    });
  }, [competitions]);

  useEffect(function () {
    function onWk() {
      const sess = readSelectedCompetition();
      if (!sess || !competitions.some(function (c) {
        return c.id === sess.id;
      })) {
        return;
      }
      setCompetitionId(sess.id);
    }
    window.addEventListener(WK_SELECTED_COMPETITION_EVENT, onWk);
    return function () {
      window.removeEventListener(WK_SELECTED_COMPETITION_EVENT, onWk);
    };
  }, [competitions]);

  const selected =
    competitionId != null
      ? competitions.find(function (c) {
          return c.id === competitionId;
        }) || null
      : null;

  const eventStart = selected ? parseEventStart(selected.starts_at) : null;
  const scheduleTz = resolveScheduleTimezone(selected, tz);
  const tzBanner = getTimezoneBannerInfo(scheduleTz);
  const loc = lang === "ar" ? "ar-SA" : lang;
  const kickoffLine =
    eventStart && !isNaN(eventStart.getTime())
      ? new Intl.DateTimeFormat(loc, {
          timeZone: scheduleTz,
          dateStyle: "medium",
          timeStyle: "short",
        }).format(eventStart)
      : "";

  const diff = eventStart ? eventStart.getTime() - now : 0;
  const started = eventStart ? diff <= 0 : false;
  const d = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  const h = Math.max(0, Math.floor((diff / (1000 * 60 * 60)) % 24));
  const mi = Math.max(0, Math.floor((diff / (1000 * 60)) % 60));
  const s = Math.max(0, Math.floor((diff / 1000) % 60));

  function onPickCompetition(e) {
    const v = e.target.value;
    const id = v ? Number(v) : null;
    setCompetitionId(id);
    if (id == null) return;
    const c = competitions.find(function (x) {
      return x.id === id;
    });
    if (c) {
      writeSelectedCompetition({
        id: c.id,
        name: (c.name && String(c.name).trim()) || c.slug || "",
        slug: c.slug,
        registration_deadline: c.registration_deadline,
        registration_open: c.registration_open,
      });
    }
  }

  if (listLoading) {
    return (
      <div className="countdown-wrap">
        <div className="spinner" style={{ margin: "24px auto" }} />
      </div>
    );
  }

  if (!competitions.length) {
    return (
      <div className="countdown-wrap">
        <div className="card" style={{ color: "var(--fg-muted)", fontSize: 14, marginBottom: 16 }}>
          {m2.noCompetitionsList || "No competitions available."}
        </div>
        <div style={{ color: "var(--fg-muted)", fontSize: 13 }}>{t.resultsPage}</div>
      </div>
    );
  }

  return (
    <div className="countdown-wrap">
      <div
        className="card"
        style={{
          marginBottom: 20,
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
          value={competitionId != null ? String(competitionId) : ""}
          onChange={onPickCompetition}
        >
          {competitions.map(function (c) {
            let label = (c.name && String(c.name).trim() ? c.name : c.slug) || "—";
            if (c.slug && c.slug !== label) label = label + " (" + c.slug + ")";
            return (
              <option key={String(c.id)} value={String(c.id)}>
                {label}
              </option>
            );
          })}
        </select>
      </div>

      <img src={PHOTOS.wcPhoto} alt="" className="countdown-wc-bg" onError={function (e) { e.target.style.display = "none"; }} />

      {!eventStart ? (
        <React.Fragment>
          <div className="countdown-label">{t.countdownTo}</div>
          <div style={{ marginTop: 16, color: "var(--fg-muted)", fontSize: 14, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
            {m2.noPoolStartDate || "This pool has no start date set."}
          </div>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <div className="countdown-label">{started ? t.started : t.countdownTo}</div>
          {!started && (
            <div className="countdown-grid">
              <div className="countdown-unit"><div className="countdown-num">{String(d).padStart(2, "0")}</div><div className="countdown-unit-label">{t.days}</div></div>
              <div className="countdown-unit"><div className="countdown-num">{String(h).padStart(2, "0")}</div><div className="countdown-unit-label">{t.hours}</div></div>
              <div className="countdown-unit"><div className="countdown-num">{String(mi).padStart(2, "0")}</div><div className="countdown-unit-label">{t.minutes}</div></div>
              <div className="countdown-unit"><div className="countdown-num">{String(s).padStart(2, "0")}</div><div className="countdown-unit-label">{t.seconds}</div></div>
            </div>
          )}
        </React.Fragment>
      )}

      <div style={{ marginTop: 24, color: "var(--fg-muted)", fontSize: 13, position: "relative", lineHeight: 1.5 }}>
        {selected ? (
          <React.Fragment>
            <div style={{ fontWeight: 600, color: "var(--fg)" }}>
              {selected.name || selected.slug || "—"}
            </div>
            {kickoffLine ? (
              <div>
                {tzBanner.flag} {tzBanner.label}
                {tzBanner.short ? " (" + tzBanner.short + ")" : ""}
                {" · "}
                {kickoffLine}
              </div>
            ) : null}
            {eventStart && m2.competitionScheduleNote ? (
              <div style={{ marginTop: 8, fontSize: 12 }}>{m2.competitionScheduleNote}</div>
            ) : null}
          </React.Fragment>
        ) : null}
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>{t.resultsPage}</div>
      </div>
    </div>
  );
}
