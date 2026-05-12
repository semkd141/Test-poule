"use client";

import React, { useState, useEffect, useMemo, useCallback, createContext, useContext } from "react";
import { useApp } from "../poule-context.jsx";
import { LANGUAGES } from "../../../lib/wk/locale";
import {
  getCompetitionScheduleTimezoneOverride,
  getTimezoneBannerInfo,
  resolveScheduleTimezone,
} from "../../../lib/wk/competition-timezone";
import {
  readSelectedCompetition,
  listPublicCompetitions,
  listPublicFixtureMappings,
  fetchFixtureStatistics,
  WK_SELECTED_COMPETITION_EVENT,
} from "../../../lib/wk/api-client";

/** Full bracket order: group stage, then knockout (R16 → quarters → semis → third-place → final). */
const TOURNAMENT_PHASE_ORDER = ["group", "r16", "qr", "qf", "sf", "thirdp", "final"];

const KNOCKOUT_STAGE_ORDER = TOURNAMENT_PHASE_ORDER.filter(function (p) {
  return p !== "group";
});

const Matches2Ctx = createContext(null);

function useMatches2() {
  const v = useContext(Matches2Ctx);
  if (!v) throw new Error("useMatches2: missing provider");
  return v;
}

function normStage(s) {
  const x = String(s || "").toLowerCase();
  if (x === "qr") return "qf";
  return x;
}

/** `fixture_mappings.team_1` / `team_2` — same keys as API JSON. */
function rowTeam1(row) {
  var v = row.team_1;
  return v != null && String(v).trim() ? String(v).trim() : "";
}

function rowTeam2(row) {
  var v = row.team_2;
  return v != null && String(v).trim() ? String(v).trim() : "";
}

function isGroupRow(row) {
  const st = String(row.stage || "").toLowerCase();
  if (st === "group") return true;
  const lk = String(row.local_key || "");
  return lk.startsWith("gm-");
}

function stageTitleKey(row) {
  const st = row.stage != null && String(row.stage).trim() ? normStage(row.stage) : "";
  if (st) return st;
  const lk = String(row.local_key || "").toLowerCase();
  if (lk.startsWith("gm-")) return "group";
  if (lk.startsWith("r16-")) return "r16";
  if (lk.startsWith("qr-")) return "qr";
  if (lk.startsWith("qf-")) return "qf";
  if (lk.startsWith("sf-")) return "sf";
  if (lk.startsWith("tp-") || lk.startsWith("thirdp-")) return "thirdp";
  if (lk.startsWith("f-") || lk.startsWith("final-")) return "final";
  return "";
}

/** Phase for sorting (does not merge qr→qf; uses local_key prefix when present). */
function tournamentPhaseForSort(row) {
  if (isGroupRow(row)) return "group";
  const lk = String(row.local_key || "").toLowerCase();
  if (lk.startsWith("gm-")) return "group";
  if (lk.startsWith("r16-")) return "r16";
  if (lk.startsWith("qr-")) return "qr";
  if (lk.startsWith("qf-")) return "qf";
  if (lk.startsWith("sf-")) return "sf";
  if (lk.startsWith("tp-") || lk.startsWith("thirdp-")) return "thirdp";
  if (lk.startsWith("final-") || lk.startsWith("f-")) return "final";
  const st = String(row.stage || "").toLowerCase();
  if (
    st === "group" ||
    st === "r16" ||
    st === "qr" ||
    st === "qf" ||
    st === "sf" ||
    st === "thirdp" ||
    st === "final"
  ) {
    return st;
  }
  return "";
}

function tournamentPhaseRank(row) {
  const phase = tournamentPhaseForSort(row);
  if (!phase) return 999;
  const idx = TOURNAMENT_PHASE_ORDER.indexOf(phase);
  return idx >= 0 ? idx : 999;
}

function groupLetterFromIndex(i) {
  if (i >= 0 && i < 26) return String.fromCharCode(65 + i);
  return String(i + 1);
}

/**
 * Derive group-stage pots from `fixture_mappings`: teams that face each other in group
 * matches belong to the same group (union-find). Works for `gm-001`-style keys without a letter.
 */
function buildGroupsFromGroupStageRows(rows) {
  const groupRows = rows.filter(isGroupRow);
  const parent = {};
  function find(a) {
    if (!a) return "";
    if (parent[a] === undefined) parent[a] = a;
    if (parent[a] !== a) parent[a] = find(parent[a]);
    return parent[a];
  }
  function union(a, b) {
    if (!a || !b) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }
  const teamSet = new Set();
  for (let i = 0; i < groupRows.length; i++) {
    const r = groupRows[i];
    const t1 = rowTeam1(r);
    const t2 = rowTeam2(r);
    if (t1) teamSet.add(t1);
    if (t2) teamSet.add(t2);
  }
  teamSet.forEach(function (t) {
    parent[t] = t;
  });
  for (let j = 0; j < groupRows.length; j++) {
    const rr = groupRows[j];
    union(rowTeam1(rr), rowTeam2(rr));
  }
  const byRoot = new Map();
  teamSet.forEach(function (t) {
    const root = find(t);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(t);
  });
  const groupList = Array.from(byRoot.values());
  groupList.forEach(function (g) {
    g.sort(function (a, b) {
      return String(a).localeCompare(String(b));
    });
  });
  groupList.sort(function (a, b) {
    return String(a[0] || "").localeCompare(String(b[0] || ""));
  });
  return groupList;
}

function compareFixtureRowsTournamentThenKickoff(a, b, lang, tz) {
  const ra = tournamentPhaseRank(a);
  const rb = tournamentPhaseRank(b);
  if (ra !== rb) return ra - rb;
  const ka = formatKickoffLocalized(a.kickoff_at, lang, tz).sortKey;
  const kb = formatKickoffLocalized(b.kickoff_at, lang, tz).sortKey;
  if (ka && kb && ka !== kb) return ka.localeCompare(kb);
  if (ka && !kb) return -1;
  if (!ka && kb) return 1;
  return String(a.local_key || "").localeCompare(String(b.local_key || ""));
}

/** Calendar YYYY-MM-DD in `timeZone` for grouping (matches date label timezone). */
function calendarDateKeyInTz(iso, timeZone) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  var y = "";
  var m = "";
  var day = "";
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (p.type === "year") y = p.value;
    else if (p.type === "month") m = p.value;
    else if (p.type === "day") day = p.value;
  }
  if (!y || !m || !day) return "";
  return y + "-" + m + "-" + day;
}

/** Show stats CTA only after kickoff + 2.5h (typical full-time window). */
var STATS_AFTER_KICKOFF_MS = 2.5 * 60 * 60 * 1000;

function isPastStatsWindow(kickoffIso, nowMs) {
  if (!kickoffIso) return false;
  var kick = new Date(kickoffIso).getTime();
  if (isNaN(kick)) return false;
  var now = nowMs != null ? nowMs : Date.now();
  return now >= kick + STATS_AFTER_KICKOFF_MS;
}

function useScheduleClockMs() {
  const [nowMs, setNowMs] = useState(function () {
    return Date.now();
  });
  useEffect(function () {
    var id = window.setInterval(function () {
      setNowMs(Date.now());
    }, 60000);
    return function () {
      window.clearInterval(id);
    };
  }, []);
  return nowMs;
}

function formatKickoffLocalized(iso, lang, tz) {
  if (!iso) {
    return { dateLabel: "—", timeLabel: "—", sortKey: "", dateKey: "zzzz-no-date" };
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return { dateLabel: "—", timeLabel: "—", sortKey: "", dateKey: "zzzz-no-date" };
  }
  const useTz = tz || (LANGUAGES.find(function (l) { return l.code === lang; }) || LANGUAGES[0]).tz;
  const loc = lang === "ar" ? "ar-SA" : lang;
  const dateFmt = new Intl.DateTimeFormat(loc, {
    timeZone: useTz,
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const timeFmt = new Intl.DateTimeFormat(loc, {
    timeZone: useTz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const cal = calendarDateKeyInTz(iso, useTz);
  const dateLabel = dateFmt.format(d);
  return {
    dateLabel: dateLabel,
    timeLabel: timeFmt.format(d),
    sortKey: d.toISOString(),
    dateKey: cal ? cal + "|" + dateLabel : "zzzz-no-date|" + dateLabel,
  };
}

/** Long-form date + local time with zone (for statistics modal). */
function formatKickoffForStatisticsModal(iso, lang, tz) {
  if (!iso) {
    return { dateLine: "—", timeLine: "" };
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return { dateLine: "—", timeLine: "" };
  }
  const useTz = tz || (LANGUAGES.find(function (l) { return l.code === lang; }) || LANGUAGES[0]).tz;
  const loc = lang === "ar" ? "ar-SA" : lang;
  const dateLine = new Intl.DateTimeFormat(loc, {
    timeZone: useTz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  const timeLine = new Intl.DateTimeFormat(loc, {
    timeZone: useTz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(d);
  return { dateLine: dateLine, timeLine: timeLine };
}

function pickDefaultCompetitionId(rows) {
  if (!rows.length) return null;
  const sess = readSelectedCompetition();
  if (sess && rows.some(function (c) { return c.id === sess.id; })) return sess.id;
  return rows[0].id;
}

function useFixtureMappingsForCompetition(competitionId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(function () {
    /* eslint-disable react-hooks/set-state-in-effect -- reset then fetch when competition id changes */
    if (competitionId == null || !Number.isFinite(Number(competitionId))) {
      setRows([]);
      setErr("");
      setLoading(false);
      return;
    }
    var cancelled = false;
    setLoading(true);
    setErr("");
    listPublicFixtureMappings(Number(competitionId))
      .then(function (data) {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch(function (e) {
        if (!cancelled) {
          setErr(e && e.message ? String(e.message) : "Error");
          setRows([]);
        }
      })
      .finally(function () {
        if (!cancelled) setLoading(false);
      });
    return function () {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [competitionId]);

  return { rows, loading, err };
}

function CompetitionPicker() {
  const { t } = useApp();
  const m2 = t.matches2Tab || {};
  var ctx = useMatches2();
  var competitions = ctx.competitions;
  var listLoading = ctx.listLoading;
  var competitionId = ctx.competitionId;
  var setCompetitionId = ctx.setCompetitionId;

  if (listLoading) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="spinner" style={{ margin: "8px auto" }}></div>
      </div>
    );
  }

  if (!competitions.length) {
    return (
      <div className="card" style={{ marginBottom: 16, color: "var(--fg-muted)", fontSize: 14 }}>
        {m2.noCompetitionsList || "No competitions available."}
      </div>
    );
  }

  return (
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
        value={competitionId != null ? String(competitionId) : ""}
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
  );
}

export function Matches2Tab() {
  const { t, tz } = useApp();
  const scheduleNowMs = useScheduleClockMs();
  const [sub, setSub] = useState("schedule");
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
    if (!competitions.length) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- default pool when list loads */
    setCompetitionId(function (prev) {
      if (prev != null && competitions.some(function (c) { return c.id === prev; })) return prev;
      return pickDefaultCompetitionId(competitions);
    });
  }, [competitions]);

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

  var selectedCompetition = useMemo(function () {
    return competitions.find(function (c) { return c.id === competitionId; }) || null;
  }, [competitions, competitionId]);

  var scheduleTz = useMemo(function () {
    return resolveScheduleTimezone(selectedCompetition, tz);
  }, [selectedCompetition, tz]);

  var mappings = useFixtureMappingsForCompetition(competitionId);

  const [statsModal, setStatsModal] = useState(null);

  const requestFixtureStatistics = useCallback(
    function (fixtureId) {
      var fid = Number(fixtureId);
      var cid = competitionId != null ? Number(competitionId) : NaN;
      if (!Number.isFinite(fid) || fid <= 0 || !Number.isFinite(cid) || cid <= 0) return;
      setStatsModal({ open: true, fixtureId: fid, loading: true, data: null, error: null });
      fetchFixtureStatistics(cid, fid)
        .then(function (data) {
          setStatsModal(function (s) {
            if (!s || !s.open) return s;
            return { open: true, fixtureId: fid, loading: false, data: data, error: null };
          });
        })
        .catch(function (e) {
          var msg = e && e.message ? String(e.message) : String(e);
          setStatsModal(function (s) {
            if (!s || !s.open) return s;
            return { open: true, fixtureId: fid, loading: false, data: null, error: msg };
          });
        });
    },
    [competitionId],
  );

  const closeStatsModal = useCallback(function () {
    setStatsModal(null);
  }, []);

  var ctxValue = useMemo(
    function () {
      return {
        competitionId,
        setCompetitionId,
        competitions,
        listLoading,
        selectedCompetition,
        scheduleTz,
        scheduleNowMs,
        requestFixtureStatistics,
        mappingsRows: mappings.rows,
        mappingsLoading: mappings.loading,
        mappingsErr: mappings.err,
      };
    },
    [
      competitionId,
      competitions,
      listLoading,
      selectedCompetition,
      scheduleTz,
      scheduleNowMs,
      requestFixtureStatistics,
      mappings.rows,
      mappings.loading,
      mappings.err,
    ],
  );

  return (
    <Matches2Ctx.Provider value={ctxValue}>
      <CompetitionPicker />
      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className={"tab " + (sub === "schedule" ? "active" : "")} onClick={function () { setSub("schedule"); }}>
          {t.matchSchedule}
        </button>
        <button className={"tab " + (sub === "groups" ? "active" : "")} onClick={function () { setSub("groups"); }}>
          {t.groups}
        </button>
        <button className={"tab " + (sub === "knockout" ? "active" : "")} onClick={function () { setSub("knockout"); }}>
          {t.knockout}
        </button>
      </div>
      {sub === "schedule" && <ScheduleView2 />}
      {sub === "groups" && <GroupsView2 />}
      {sub === "knockout" && <KnockoutView2 />}
      <FixtureStatisticsModal state={statsModal} onClose={closeStatsModal} />
    </Matches2Ctx.Provider>
  );
}

function FixtureStatisticsModal(props) {
  var state = props.state;
  var onClose = props.onClose;
  var app = useApp();
  var t = app.t;
  var lang = app.lang;
  var profileTz = app.tz;
  var m2 = t.matches2Tab || {};
  var scheduleTz = useMatches2().scheduleTz;
  var kickoffTz = scheduleTz || profileTz;

  useEffect(
    function () {
      if (!state || !state.open) return;
      function onKey(e) {
        if (e.key === "Escape") onClose();
      }
      window.addEventListener("keydown", onKey);
      return function () {
        window.removeEventListener("keydown", onKey);
      };
    },
    [state, onClose],
  );

  if (!state || !state.open) return null;

  var match = state.data && state.data.match ? state.data.match : null;
  var players = state.data && Array.isArray(state.data.players) ? state.data.players : [];
  var source = state.data && state.data.source ? state.data.source : "";
  var kickoffFmt =
    match && match.kickoff_at
      ? formatKickoffForStatisticsModal(String(match.kickoff_at), lang, kickoffTz)
      : { dateLine: "—", timeLine: "" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wk-fixture-stats-title"
      className="modal-backdrop"
      onClick={function (e) {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal wk-fixture-stats-modal"
        style={{ maxWidth: 640, width: "100%", padding: 0, overflow: "hidden" }}
        onClick={function (e) {
          e.stopPropagation();
        }}
      >
        <div
          style={{
            padding: "20px 22px 16px",
            borderBottom: "1px solid var(--border)",
            background: "linear-gradient(180deg, rgba(255,107,0,0.08), transparent)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div
                id="wk-fixture-stats-title"
                className="modal-title"
                style={{ marginBottom: 8, fontSize: 24, lineHeight: 1.15 }}
              >
                {m2.statsDialogTitle || "Match statistics"}
              </div>
              {source ? (
                <span
                  className="badge"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}
                >
                  {source === "database"
                    ? m2.statsBadgeSaved || "Saved"
                    : m2.statsBadgeSync || "Live sync"}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="modal-close"
              aria-label={m2.statsClose || "Close"}
              onClick={onClose}
              style={{ flexShrink: 0, fontSize: 22, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ padding: "20px 22px 24px", maxHeight: "min(72vh, 640px)", overflowY: "auto" }}>
          {state.loading ? (
            <div className="spinner" style={{ margin: "32px auto" }} />
          ) : state.error ? (
            <div
              style={{
                color: "var(--danger, #c00)",
                fontSize: 14,
                lineHeight: 1.55,
                padding: 14,
                borderRadius: 12,
                background: "rgba(220, 38, 38, 0.08)",
                border: "1px solid rgba(220, 38, 38, 0.25)",
              }}
            >
              {state.error}
            </div>
          ) : (
            <React.Fragment>
              {match ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid var(--border)",
                    background: "var(--bg-3)",
                    padding: "20px 18px",
                    marginBottom: 22,
                  }}
                >
                  <div
                    className="wk-fixture-stats-scoregrid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto 1fr",
                      gap: 12,
                      alignItems: "center",
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ textAlign: "right", minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "var(--wk-heading-font)",
                          fontSize: "clamp(16px, 3.5vw, 22px)",
                          letterSpacing: "0.04em",
                          lineHeight: 1.2,
                          color: "var(--fg)",
                        }}
                      >
                        {String(match.home_team ?? "—")}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        padding: "0 8px",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "var(--wk-heading-font)",
                          fontSize: "clamp(28px, 7vw, 40px)",
                          lineHeight: 1,
                          color: "var(--orange)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {String(match.home_goals ?? "—")} : {String(match.away_goals ?? "—")}
                      </div>
                      <span className="match-vs" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
                        {m2.statsFinalScore || "Final score"}
                      </span>
                    </div>
                    <div style={{ textAlign: "left", minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "var(--wk-heading-font)",
                          fontSize: "clamp(16px, 3.5vw, 22px)",
                          letterSpacing: "0.04em",
                          lineHeight: 1.2,
                          color: "var(--fg)",
                        }}
                      >
                        {String(match.away_team ?? "—")}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    }}
                  >
                    <div>
                      <div className="wk-fixture-stats-meta-label">{m2.statsKickoff || "Kickoff"}</div>
                      <div className="wk-fixture-stats-meta-value">{kickoffFmt.dateLine}</div>
                      {kickoffFmt.timeLine ? (
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--fg-muted)",
                            marginTop: 4,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {kickoffFmt.timeLine}
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <div className="wk-fixture-stats-meta-label">{m2.statsStatus || "Status"}</div>
                      <div className="wk-fixture-stats-meta-value">{String(match.status ?? "—")}</div>
                    </div>
                    {match.round != null && String(match.round).trim() ? (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div className="wk-fixture-stats-meta-label">{m2.statsRound || "Round"}</div>
                        <div className="wk-fixture-stats-meta-value">{String(match.round)}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="settings-label" style={{ marginBottom: 12 }}>
                {m2.statsPlayersHeading || "Squad & points"}
              </div>
              {players.length === 0 ? (
                <div
                  style={{
                    color: "var(--fg-muted)",
                    fontSize: 14,
                    padding: 16,
                    textAlign: "center",
                    borderRadius: 12,
                    border: "1px dashed var(--border)",
                  }}
                >
                  {m2.statsNoPlayers || "No player statistics for this fixture yet."}
                </div>
              ) : (
                <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
                  <table className="wk-stats-table">
                    <thead>
                      <tr>
                        <th>{m2.statsColTeam || "Team"}</th>
                        <th>{m2.statsColPlayer || "Player"}</th>
                        <th>{m2.statsColPoints || t.pts || "Pts"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map(function (p, idx) {
                        var rowKey =
                          p.player_id != null && p.player_id > 0
                            ? String(p.player_id) + "-" + p.land
                            : idx + "-" + p.land + "-" + p.speler_naam;
                        return (
                          <tr key={rowKey}>
                            <td>{p.land}</td>
                            <td>{p.speler_naam}</td>
                            <td>{p.punten}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-outline" onClick={onClose}>
                  {m2.statsClose || "Close"}
                </button>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

function ScheduleView2() {
  const { lang, t } = useApp();
  const m2 = t.matches2Tab || {};
  var ctx = useMatches2();
  var rows = ctx.mappingsRows;
  var loading = ctx.mappingsLoading;
  var err = ctx.mappingsErr;
  var competitionId = ctx.competitionId;
  var listLoading = ctx.listLoading;
  var selected = ctx.selectedCompetition;
  var scheduleTz = ctx.scheduleTz;

  const currentTzInfo = getTimezoneBannerInfo(scheduleTz);
  const useCompetitionTz = getCompetitionScheduleTimezoneOverride(selected) != null;

  const grouped = useMemo(function () {
    const list = rows.slice().sort(function (a, b) {
      return compareFixtureRowsTournamentThenKickoff(a, b, lang, scheduleTz);
    });
    const map = new Map();
    list.forEach(function (row) {
      const info = formatKickoffLocalized(row.kickoff_at, lang, scheduleTz);
      const key = info.dateKey || "zzzz-no-date";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return Array.from(map.entries()).sort(function (a, b) { return a[0].localeCompare(b[0]); });
  }, [rows, lang, scheduleTz]);

  if (listLoading || competitionId == null) {
    return listLoading ? <div className="spinner"></div> : null;
  }

  if (loading) return <div className="spinner"></div>;

  if (err) {
    return (
      <div className="card" style={{ color: "var(--danger, #c00)", fontSize: 14 }}>
        {m2.loadError || "Could not load fixtures."} {err}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card" style={{ color: "var(--fg-muted)", fontSize: 14 }}>
        {m2.empty || "No fixture mappings for this competition yet."}
      </div>
    );
  }

  return (
    <React.Fragment>
      <div
        style={{
          background: "linear-gradient(135deg, rgba(255,107,0,0.12), rgba(255,107,0,0.04))",
          border: "1px solid var(--orange)",
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 22 }}>🕐</span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "var(--orange)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>
            {t.timezoneInfo}
          </div>
          <div style={{ fontFamily: "var(--wk-heading-font)", fontSize: 18, letterSpacing: "0.05em" }}>
            {currentTzInfo.flag} {currentTzInfo.label}
            {currentTzInfo.short ? " (" + currentTzInfo.short + ")" : ""}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
          {selected && selected.name ? String(selected.name) : ""}
        </div>
        <div style={{ fontSize: 11, color: "var(--fg-muted)", fontStyle: "italic" }}>
          {useCompetitionTz
            ? m2.competitionScheduleNote || "Times use this competition’s official schedule timezone."
            : t.changeInSettings || "Change in settings ⚙️"}
        </div>
      </div>
      {grouped.map(function (entry) {
        const key = entry[0];
        const dayRows = entry[1];
        const dateLabel =
          key === "zzzz-no-date" || (typeof key === "string" && key.startsWith("zzzz-no-date"))
            ? m2.noKickoffYet || "Date TBD"
            : key.split("|")[1] || key;
        return (
          <div key={key}>
            <div className="match-date-header">{dateLabel}</div>
            {dayRows.map(function (row) {
              return <MappingMatchRow key={String(row.id)} row={row} />;
            })}
          </div>
        );
      })}
    </React.Fragment>
  );
}

function MappingMatchRow(props) {
  const { lang, t } = useApp();
  const m2 = t.matches2Tab || {};
  const row = props.row;
  var mctx = useMatches2();
  var scheduleTz = mctx.scheduleTz;
  var scheduleNowMs = mctx.scheduleNowMs;
  const info = formatKickoffLocalized(row.kickoff_at, lang, scheduleTz);
  const sk = stageTitleKey(row);
  const stageHuman = t[sk] || row.stage || "—";
  const home = rowTeam1(row) || (t.tbd || "TBD");
  const away = rowTeam2(row) || (t.tbd || "TBD");
  const apiId = row.api_fixture_id != null && row.api_fixture_id !== "" ? String(row.api_fixture_id) : null;
  const fixtureNum = row.api_fixture_id != null ? Number(row.api_fixture_id) : NaN;
  const hasFixtureId = Number.isFinite(fixtureNum) && fixtureNum > 0;
  const showStatsBtn = isPastStatsWindow(row.kickoff_at, scheduleNowMs) && hasFixtureId;
  var requestFixtureStatistics = mctx.requestFixtureStatistics;

  return (
    <div className="match-row">
      <div>
        <div className="match-team left">{home}</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div className="match-vs">{info.timeLabel}</div>
        <div className="match-meta">
          {row.local_key ? <span className="badge">{row.local_key}</span> : null}
          <span className="badge">{stageHuman}</span>
          {row.location && String(row.location).trim() ? (
            <span style={{ opacity: 0.85 }}>📍 {row.location}</span>
          ) : null}
          {apiId ? <span style={{ opacity: 0.75 }}>API #{apiId}</span> : null}
        </div>
        {showStatsBtn ? (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: 12, padding: "6px 12px" }}
              onClick={function () {
                if (typeof requestFixtureStatistics === "function") requestFixtureStatistics(fixtureNum);
              }}
            >
              {m2.viewStatistics || "View Statistics"}
            </button>
          </div>
        ) : null}
      </div>
      <div>
        <div className="match-team right">{away}</div>
      </div>
    </div>
  );
}

function GroupsView2() {
  const { t } = useApp();
  const m2 = t.matches2Tab || {};
  var ctx = useMatches2();
  var rows = ctx.mappingsRows;
  var loading = ctx.mappingsLoading;
  var competitionId = ctx.competitionId;
  var listLoading = ctx.listLoading;

  const groupsDerived = useMemo(function () {
    return buildGroupsFromGroupStageRows(rows);
  }, [rows]);

  if (listLoading || competitionId == null) {
    return listLoading ? <div className="spinner"></div> : null;
  }
  if (loading) return <div className="spinner"></div>;

  if (!groupsDerived.length) {
    return (
      <div className="card" style={{ color: "var(--fg-muted)", fontSize: 14 }}>
        {m2.noGroupTeams || "No group-stage team names in fixture data yet."}
      </div>
    );
  }

  return (
    <div className="groups-grid">
      {groupsDerived.map(function (teams, idx) {
        var letter = groupLetterFromIndex(idx);
        return (
          <div key={letter + "-" + idx} className="group-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div className="group-letter" style={{ margin: 0 }}>
                {letter}
              </div>
              <div
                style={{
                  fontFamily: "var(--wk-heading-font)",
                  fontSize: 18,
                  color: "var(--fg-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {t.groupLabel} {letter}
              </div>
            </div>
            {teams.map(function (team) {
              return (
                <div key={team} className="group-team">
                  <span>{team}</span>
                  <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>—</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function KnockoutView2() {
  const { t, lang } = useApp();
  var ctx = useMatches2();
  var rows = ctx.mappingsRows;
  var loading = ctx.mappingsLoading;
  var competitionId = ctx.competitionId;
  var listLoading = ctx.listLoading;
  var scheduleTz = ctx.scheduleTz;

  const byStage = useMemo(function () {
    const map = new Map();
    KNOCKOUT_STAGE_ORDER.forEach(function (s) {
      map.set(s, []);
    });
    rows.forEach(function (row) {
      if (isGroupRow(row)) return;
      const k = tournamentPhaseForSort(row);
      if (!k || k === "group") return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(row);
    });
    map.forEach(function (list) {
      list.sort(function (a, b) {
        return compareFixtureRowsTournamentThenKickoff(a, b, lang, scheduleTz);
      });
    });
    return map;
  }, [rows, lang, scheduleTz]);

  if (listLoading || competitionId == null) {
    return listLoading ? <div className="spinner"></div> : null;
  }
  if (loading) return <div className="spinner"></div>;

  const anyKnockout = KNOCKOUT_STAGE_ORDER.some(function (s) {
    return (byStage.get(s) || []).length > 0;
  });

  if (!anyKnockout) {
    return (
      <div className="card">
        <div className="card-title">{t.knockout}</div>
        <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 18, padding: "12px 16px", background: "var(--bg-3)", borderRadius: 10, borderLeft: "3px solid var(--orange)" }}>
          {t.knockoutInfo || "Knockout matches will appear once filled in the fixture map."}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">{t.knockout}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {KNOCKOUT_STAGE_ORDER.map(function (stageKey) {
          const list = byStage.get(stageKey) || [];
          if (!list.length) return null;
          const title = t[stageKey] || stageKey;
          return (
            <div key={stageKey}>
              <div className="match-date-header" style={{ marginBottom: 8 }}>
                {title}
              </div>
              {list.map(function (row) {
                return <MappingMatchRow key={String(row.id)} row={row} />;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
