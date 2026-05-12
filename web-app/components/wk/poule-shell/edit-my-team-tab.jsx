"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useApp } from "../poule-context.jsx";
import {
  authSaveSession,
  authLoadSession,
  authSendMagicLink,
  authSignInWithPassword,
  authSignUp,
  authGetValidSession,
  authSignOut,
  authGetUser,
  persistSupabaseSessionToWkStorage,
  getMyDeelnemer,
  dbBijwerkenVeld,
  hideOwnedPoolsForViewer,
  listMyTeamCompetitions,
  readSelectedCompetition,
  writeSelectedCompetition,
  fetchParticipantPlayerRollups,
  fetchPublicCompetitionSquadRoster,
} from "../../../lib/wk/api-client";
import { toastError, toastWarning } from "../../../lib/wk/toast";
import { getSupabaseAuthRedirectOrigin } from "@/lib/wk/config";
import { getSupabaseBrowser } from "../../../lib/wk/supabase-browser";
import { flag, FORMATIONS } from "../../../lib/wk/tournament";
import { CaptainBand } from "./teams/captain-band.jsx";

function isCoachPosRollup(pos) {
  return String(pos || "")
    .trim()
    .toLowerCase() === "coach";
}

/** Same rules as register-tab2: API-Football lineup `pos` letter vs formation slot. */
function rosterPosMatchesFormationSlot(rosterPos, formationSlot) {
  var p = String(rosterPos || "")
    .trim()
    .toUpperCase();
  if (!p) return true;
  var letter = p.charAt(0);
  if (formationSlot === "keeper") return letter === "G";
  if (formationSlot === "def") return letter === "D";
  if (formationSlot === "mid") return letter === "M";
  if (formationSlot === "att") return letter === "F" || letter === "A";
  return false;
}

function slotHasRealPlayerRollup(slot) {
  if (!slot) return false;
  var pid = Math.floor(Number(slot.player_id));
  return Number.isFinite(pid) && pid > 0;
}

function emptySlotsForFormation(formation) {
  return {
    keeper: Array.from({ length: formation.keeper }, function() {
      return null;
    }),
    def: Array.from({ length: formation.def }, function() {
      return null;
    }),
    mid: Array.from({ length: formation.mid }, function() {
      return null;
    }),
    att: Array.from({ length: formation.att }, function() {
      return null;
    }),
    coach: [null],
  };
}

function mergeRosterRowsByPlayerId(roster) {
  var best = new Map();
  for (var i = 0; i < roster.length; i++) {
    var r = roster[i];
    if (!r || r.player_id == null) continue;
    var pid = Math.floor(Number(r.player_id));
    if (!Number.isFinite(pid) || pid <= 0) continue;
    var name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : null;
    var team = typeof r.team === "string" && r.team.trim() ? r.team.trim() : null;
    var pos = typeof r.pos === "string" && r.pos.trim() ? r.pos.trim() : null;
    var cur = best.get(pid);
    if (!cur) {
      best.set(pid, { player_id: pid, name: name, team: team, pos: pos });
      continue;
    }
    function richer(a, b) {
      var as = a != null && String(a).trim() ? String(a).trim() : "";
      var bs = b != null && String(b).trim() ? String(b).trim() : "";
      if (!as) return bs || null;
      if (!bs) return as;
      return bs.length > as.length ? bs : as;
    }
    best.set(pid, {
      player_id: pid,
      name: richer(cur.name, name),
      team: richer(cur.team, team),
      pos: richer(cur.pos, pos),
    });
  }
  return best;
}

function mapRollupPick(rollupRow, rosterById) {
  if (!rollupRow || rollupRow.player_id == null) return null;
  var pid = Math.floor(Number(rollupRow.player_id));
  if (!Number.isFinite(pid) || pid <= 0) return null;
  var meta = rosterById.get(pid);
  var pos = rollupRow.pos != null && String(rollupRow.pos).trim() ? String(rollupRow.pos).trim() : meta && meta.pos;
  return {
    player_id: pid,
    name: meta && meta.name != null ? meta.name : null,
    team: meta && meta.team != null ? meta.team : null,
    pos: pos || null,
  };
}

function rollupsIntoSlotsForEdit(rollups, rosterById, formation) {
  var sp = emptySlotsForFormation(formation);
  var coachRows = rollups.filter(function(r) {
    return isCoachPosRollup(r.pos);
  });
  var field = rollups.filter(function(r) {
    return !isCoachPosRollup(r.pos);
  });
  var i = 0;
  if (sp.keeper.length) sp.keeper[0] = mapRollupPick(field[i++], rosterById);
  for (var d = 0; d < sp.def.length; d++) {
    sp.def[d] = mapRollupPick(field[i++], rosterById);
  }
  for (var m = 0; m < sp.mid.length; m++) {
    sp.mid[m] = mapRollupPick(field[i++], rosterById);
  }
  for (var a = 0; a < sp.att.length; a++) {
    sp.att[a] = mapRollupPick(field[i++], rosterById);
  }
  if (coachRows.length && sp.coach.length) {
    sp.coach[0] = mapRollupPick(coachRows[0], rosterById);
  }
  var cap = null;
  var capRow = rollups.find(function(r) {
    return r.is_captain === true && !isCoachPosRollup(r.pos);
  });
  if (capRow && capRow.player_id != null) {
    var cpid = Math.floor(Number(capRow.player_id));
    if (Number.isFinite(cpid) && cpid > 0) {
      var order = ["keeper", "def", "mid", "att"];
      outer: for (var oi = 0; oi < order.length; oi++) {
        var p = order[oi];
        var arr = sp[p] || [];
        for (var ii = 0; ii < arr.length; ii++) {
          var slot = arr[ii];
          if (slot && slot.player_id === cpid) {
            cap = { pos: p, index: ii };
            break outer;
          }
        }
      }
    }
  }
  return { slots: sp, captain: cap };
}

function slotsToLegacyEditRows(slots, captain) {
  var out = [];
  var positions = ["keeper", "def", "mid", "att"];
  positions.forEach(function(posKey) {
    var arr = slots[posKey] || [];
    arr.forEach(function(slot, idx) {
      if (!slotHasRealPlayerRollup(slot)) return;
      var teamLabel = slot.team != null && String(slot.team).trim() ? String(slot.team).trim() : "";
      if (!teamLabel) return;
      var isCap = captain && captain.pos === posKey && captain.index === idx;
      var nm = slot.name && String(slot.name).trim() ? String(slot.name).trim() : "";
      var pid = Math.floor(Number(slot.player_id));
      out.push({
        land: teamLabel,
        positie: posKey,
        spelerNaam: nm,
        player_id: Number.isFinite(pid) && pid > 0 ? pid : undefined,
        punten: 0,
        aanvoerder: Boolean(isCap),
      });
    });
  });
  var ch = slots.coach && slots.coach[0];
  if (ch && slotHasRealPlayerRollup(ch)) {
    var coachTeam = ch.team != null && String(ch.team).trim() ? String(ch.team).trim() : "";
    if (coachTeam) {
      var cnm = ch.name && String(ch.name).trim() ? String(ch.name).trim() : "";
      var cpid = Math.floor(Number(ch.player_id));
      out.push({
        land: coachTeam,
        positie: "coach",
        spelerNaam: cnm,
        player_id: Number.isFinite(cpid) && cpid > 0 ? cpid : undefined,
        punten: 0,
      });
    }
  }
  return out;
}

function legacySpelersHasLand(spelers) {
  if (!Array.isArray(spelers)) return false;
  return spelers.some(function(sp) {
    return sp && sp.land && String(sp.land).trim();
  });
}

/**
 * @param rosterRows `fixture_squad_members` for the pool's league+season (via public squad-roster API). Caller fetches once.
 */
async function hydrateEditSpelersFromRollups(team, rosterRows) {
  var raw = Array.isArray(team.spelers) ? team.spelers.slice() : [];
  if (legacySpelersHasLand(raw)) return raw;
  var tid = team && team.id != null ? Math.floor(Number(team.id)) : NaN;
  var cid = team && team.competition_id != null ? Math.floor(Number(team.competition_id)) : NaN;
  if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(cid) || cid <= 0) return raw;
  var roll = await fetchParticipantPlayerRollups(tid);
  var roster = Array.isArray(rosterRows) ? rosterRows : [];
  var rosterById = mergeRosterRowsByPlayerId(roster);
  var sys = team.systeem && FORMATIONS[team.systeem] ? team.systeem : "4-3-3";
  var formation = FORMATIONS[sys];
  var mapped = rollupsIntoSlotsForEdit(Array.isArray(roll) ? roll : [], rosterById, formation);
  var leg = slotsToLegacyEditRows(mapped.slots, mapped.captain);
  return leg.length ? leg : raw;
}

function rosterFieldOptionsForSlot(roster, sp) {
  var pos = sp.positie;
  var side = sp.land != null ? String(sp.land).trim() : "";
  var rows = Array.isArray(roster) ? roster : [];
  var field = rows.filter(function(r) {
    return r && !isCoachPosRollup(r.pos) && rosterPosMatchesFormationSlot(r.pos, pos);
  });
  if (!side) return field;
  var sameSide = field.filter(function(r) {
    return (r.team != null ? String(r.team).trim() : "") === side;
  });
  return sameSide.length > 0 ? sameSide : field;
}

function rosterCoachesFromDb(roster) {
  var m = mergeRosterRowsByPlayerId(Array.isArray(roster) ? roster : []);
  var out = [];
  m.forEach(function(row) {
    if (row && isCoachPosRollup(row.pos)) out.push(row);
  });
  out.sort(function(a, b) {
    var ta = String(a.team || "").localeCompare(String(b.team || ""));
    if (ta !== 0) return ta;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  return out;
}

/** Match legacy row to roster `player_id` when `player_id` was not stored on the team row. */
function resolvePlayerIdFromLegacyRow(sp, roster) {
  if (sp && sp.player_id != null) {
    var x = Math.floor(Number(sp.player_id));
    if (Number.isFinite(x) && x > 0) return x;
  }
  var name = sp && (sp.spelerNaam || "").trim();
  var side = sp && (sp.land || "").trim();
  if (!name && !side) return null;
  var m = mergeRosterRowsByPlayerId(Array.isArray(roster) ? roster : []);
  var hit = null;
  m.forEach(function(r) {
    if (hit) return;
    if (sp.positie === "coach") {
      if (!isCoachPosRollup(r.pos)) return;
    } else if (isCoachPosRollup(r.pos)) {
      return;
    }
    var nm = (r.name || "").trim();
    var tm = (r.team || "").trim();
    if (name && side && nm === name && tm === side) hit = Math.floor(Number(r.player_id));
  });
  return hit != null && Number.isFinite(hit) && hit > 0 ? hit : null;
}

function formatSupabaseAuthError(err) {
  if (err == null) return "Unknown error";
  if (typeof err === "string") return err;
  if (typeof err !== "object") return String(err);
  var msg = err.message ? String(err.message) : "";
  var code = err.code != null ? String(err.code) : "";
  var status = err.status != null ? String(err.status) : "";
  var parts = [];
  if (msg) parts.push(msg);
  if (code) parts.push("code:" + code);
  if (status) parts.push("http:" + status);
  return parts.length ? parts.join(" · ") : "Sign-in failed";
}

const editMyTeamTabFallback = {
  pickCompetitionTitle: "Choose a competition",
  pickCompetitionIntro:
    "Only pools you belong to as a member, or where you already have a team, are listed—not every public competition. Pools you only organize (without a team in that pool) are not shown here.",
  pickCompetitionRemember: "This choice is remembered for this browser session.",
  noTeamInPoolTitle: "No team registered for this pool",
  noTeamInPoolDescription:
    "Register on the Register tab with this email first, or choose another competition where you already have a team.",
};

export function EditMyTeamTab() {
  const { t, participants, config, reloadParticipants } = useApp();
  const etm = t.editMyTeamTab || editMyTeamTabFallback;

  // Auth state
  const [authState, setAuthState] = useState("loading"); // loading | unauthenticated | sending | sent | signup_check_email | pick_competition | authenticated | no_team
  const [session, setSession] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [emailInput, setEmailInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoginMode, setAuthLoginMode] = useState("magic"); // magic | password | google
  const [pwEmail, setPwEmail] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  /** If true → sign-in API; if false → sign-up API */
  const [alreadyHaveAccount, setAlreadyHaveAccount] = useState(true);
  const [signupFallbackBusy, setSignupFallbackBusy] = useState(false);
  const supabaseEnabled = !!(typeof window !== "undefined" && getSupabaseBrowser());

  // Edit state
  const [editNaam, setEditNaam] = useState("");
  const [editTeamnaam, setEditTeamnaam] = useState("");
  const [editSpelers, setEditSpelers] = useState([]);
  /** `fixture_squad_members` for this pool's API-Football league+season (public squad-roster). */
  const [squadRoster, setSquadRoster] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [publicComps, setPublicComps] = useState([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(false);
  const [competitionSelectId, setCompetitionSelectId] = useState("");
  /** Invalidate pool list when a different account signs in (avoids stale dropdown + wrong lookups). */
  const lastSessionUserKeyRef = useRef("");

  const globalDeadlinePassed = Date.now() > config.deadline.getTime();

  /** When the pool marks registration closed, or `starts_at` / deadline has passed (matches server rules). */
  var teamEditLocked = globalDeadlinePassed;
  if (myTeam && myTeam.competition_id != null) {
    var editCid = Number(myTeam.competition_id);
    var editCrow =
      Number.isFinite(editCid) && editCid > 0
        ? publicComps.find(function(c) {
            return Number(c.id) === editCid;
          })
        : null;
    if (editCrow) {
      teamEditLocked = false;
      if (editCrow.registration_open === false) teamEditLocked = true;
      if (editCrow.starts_at != null && String(editCrow.starts_at).trim()) {
        var editTs = new Date(String(editCrow.starts_at)).getTime();
        if (!Number.isNaN(editTs) && Date.now() >= editTs) teamEditLocked = true;
      }
      if (editCrow.registration_deadline != null && String(editCrow.registration_deadline).trim()) {
        var editTd = new Date(String(editCrow.registration_deadline)).getTime();
        if (!Number.isNaN(editTd) && Date.now() > editTd) teamEditLocked = true;
      }
    }
  }

  function sessionUserKey(sess) {
    if (!sess || !sess.user) return "";
    var u = sess.user;
    if (u.id != null && String(u.id).trim()) return "id:" + String(u.id).trim();
    if (typeof u.email === "string" && u.email.trim()) return "em:" + u.email.trim().toLowerCase();
    return "";
  }

  const squadCoachOptions = useMemo(function() {
    return rosterCoachesFromDb(squadRoster);
  }, [squadRoster]);

  async function applyTeamRosterAndHydrate(team) {
    var roster = [];
    var cid = team && team.competition_id != null ? Math.floor(Number(team.competition_id)) : NaN;
    if (Number.isFinite(cid) && cid > 0) {
      try {
        roster = await fetchPublicCompetitionSquadRoster(cid);
      } catch (e) {
        console.warn("fetchPublicCompetitionSquadRoster", e);
      }
    }
    if (!Array.isArray(roster)) roster = [];
    setSquadRoster(roster);
    try {
      setEditSpelers(await hydrateEditSpelersFromRollups(team, roster));
    } catch (_h) {
      setEditSpelers(Array.isArray(team.spelers) ? team.spelers.slice() : []);
    }
  }

  function applyRosterPickToRow(rowIndex, playerIdStr, rosterSnapshot) {
    var roster = Array.isArray(rosterSnapshot) ? rosterSnapshot : [];
    if (!playerIdStr || !String(playerIdStr).trim()) {
      setEditSpelers(function(prev) {
        var next = prev.slice();
        if (!next[rowIndex]) return prev;
        next[rowIndex] = Object.assign({}, next[rowIndex], { spelerNaam: "", player_id: undefined });
        return next;
      });
      return;
    }
    var pid = Math.floor(Number(playerIdStr));
    if (!Number.isFinite(pid) || pid <= 0) return;
    var picked = mergeRosterRowsByPlayerId(roster).get(pid);
    if (!picked) return;
    var teamLabel = picked.team != null && String(picked.team).trim() ? String(picked.team).trim() : "";
    var nm = picked.name != null && String(picked.name).trim() ? String(picked.name).trim() : "";
    setEditSpelers(function(prev) {
      var next = prev.slice();
      if (!next[rowIndex]) return prev;
      next[rowIndex] = Object.assign({}, next[rowIndex], {
        land: teamLabel || next[rowIndex].land,
        spelerNaam: nm,
        player_id: pid,
      });
      return next;
    });
  }

  useEffect(function() {
    var sb = getSupabaseBrowser();
    if (!sb) return undefined;
    var r = sb.auth.onAuthStateChange(function(_evt, sess) {
      if (sess && sess.access_token && sess.user) {
        persistSupabaseSessionToWkStorage({
          access_token: sess.access_token,
          refresh_token: sess.refresh_token,
          expires_at: sess.expires_at,
          user: sess.user,
        });
      }
    });
    return function() {
      if (r && r.data && r.data.subscription) r.data.subscription.unsubscribe();
    };
  }, []);

  // On mount: Supabase session, hash callback (Express OTP legacy), or stored session
  useEffect(function() {
    async function init() {
      try {
        var sb = getSupabaseBrowser();
        if (sb) {
          var gr = await sb.auth.getSession();
          var session = gr.data.session;
          if (session && session.access_token && session.user) {
            persistSupabaseSessionToWkStorage({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_at: session.expires_at,
              user: session.user,
            });
            window.history.replaceState({}, document.title, window.location.pathname + "#edit");
            await loadTeamForSession({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_at: session.expires_at,
              user: session.user,
            });
            return;
          }
        }

        var hash = window.location.hash || "";
        if (hash.indexOf("access_token=") !== -1) {
          var params = new URLSearchParams(hash.replace(/^#/, ""));
          var access_token = params.get("access_token");
          var refresh_token = params.get("refresh_token");
          var expires_in = parseInt(params.get("expires_in") || "3600");
          if (access_token) {
            var user = {};
            try { user = await authGetUser(access_token); } catch (e0) {}
            var sessionData = {
              access_token: access_token,
              refresh_token: refresh_token || "",
              expires_at: Math.floor(Date.now() / 1000) + expires_in,
              user: user,
            };
            authSaveSession(sessionData);
            window.history.replaceState({}, document.title, window.location.pathname + "#edit");
            await loadTeamForSession(sessionData);
            return;
          }
        }

        var existing = await authGetValidSession();
        if (existing && existing.access_token) {
          await loadTeamForSession(existing);
        } else {
          setAuthState("unauthenticated");
        }
      } catch (e) {
        console.warn(e);
        setAuthState("unauthenticated");
      }
    }
    init();
  }, []);

  async function loadTeamForSession(sess) {
    setSession(sess);
    const email = sess.user && sess.user.email;
    if (!email) { setAuthState("unauthenticated"); return; }
    var sk = sessionUserKey(sess);
    if (sk !== lastSessionUserKeyRef.current) {
      lastSessionUserKeyRef.current = sk;
      setPublicComps([]);
    }
    const stored = typeof window !== "undefined" ? readSelectedCompetition() : null;
    if (!stored || !stored.id) {
      setMyTeam(null);
      setSquadRoster([]);
      setAuthState("pick_competition");
      return;
    }
    const team = await getMyDeelnemer(email, stored.id);
    if (!team) {
      setMyTeam(null);
      setSquadRoster([]);
      setAuthState("no_team");
    } else {
      setMyTeam(team);
      setEditNaam(team.naam || "");
      setEditTeamnaam(team.teamnaam || "");
      await applyTeamRosterAndHydrate(team);
      setAuthState("authenticated");
    }
  }

  /**
   * Hits the API and returns the fresh list (do not rely on closure over `publicComps`).
   * @param {{ background?: boolean }} opts - if background, skip full-card loading state (Continue / switch pool).
   */
  async function fetchMyTeamCompetitionsList(opts) {
    var bg = opts && opts.background;
    if (!bg) setCompetitionsLoading(true);
    try {
      var rows = await listMyTeamCompetitions();
      var list = Array.isArray(rows) ? rows : [];
      var uid = "";
      if (opts && opts.viewerUserId != null && String(opts.viewerUserId).trim()) {
        uid = String(opts.viewerUserId).trim();
      } else if (session && session.user && session.user.id) {
        uid = String(session.user.id).trim();
      }
      list = hideOwnedPoolsForViewer(list, uid || null);
      setPublicComps(list);
      return list;
    } catch (e) {
      console.warn("listMyTeamCompetitions", e);
      setPublicComps([]);
      return [];
    } finally {
      if (!bg) setCompetitionsLoading(false);
    }
  }

  useEffect(function() {
    if (authState !== "pick_competition" && authState !== "authenticated") return undefined;
    var cancelled = false;
    fetchMyTeamCompetitionsList({ background: false }).then(function(list) {
      if (cancelled) return;
      if (authState === "pick_competition") {
        var s = readSelectedCompetition();
        if (
          s &&
          s.id &&
          Array.isArray(list) &&
          list.some(function(c) {
            return Number(c.id) === Number(s.id);
          })
        ) {
          setCompetitionSelectId(String(s.id));
        } else {
          setCompetitionSelectId("");
        }
      }
    });
    return function() { cancelled = true; };
  }, [authState]);

  async function confirmPickCompetition() {
    var id = parseInt(competitionSelectId, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    var comps = await fetchMyTeamCompetitionsList({ background: true });
    var row = comps.find(function(c) { return Number(c.id) === id; });
    var name = row && row.name ? String(row.name) : "Competition";
    writeSelectedCompetition({ id: id, name: name, slug: row && row.slug ? String(row.slug) : undefined });
    if (!session || !session.user || !session.user.email) return;
    var team = await getMyDeelnemer(session.user.email, id);
    if (!team) {
      setMyTeam(null);
      setSquadRoster([]);
      setAuthState("no_team");
      toastWarning(etm.noTeamInPoolTitle || editMyTeamTabFallback.noTeamInPoolTitle, {
        description: etm.noTeamInPoolDescription || editMyTeamTabFallback.noTeamInPoolDescription,
      });
    } else {
      setMyTeam(team);
      setEditNaam(team.naam || "");
      setEditTeamnaam(team.teamnaam || "");
      await applyTeamRosterAndHydrate(team);
      setAuthState("authenticated");
    }
  }

  async function switchCompetition(compId) {
    var id = Number(compId);
    if (!Number.isFinite(id) || id <= 0) return;
    var comps = await fetchMyTeamCompetitionsList({ background: true });
    var row = comps.find(function(c) { return Number(c.id) === id; });
    var name = row && row.name ? String(row.name) : "Competition";
    writeSelectedCompetition({ id: id, name: name, slug: row && row.slug ? String(row.slug) : undefined });
    if (!session || !session.user || !session.user.email) return;
    var team = await getMyDeelnemer(session.user.email, id);
    if (!team) {
      setMyTeam(null);
      setSquadRoster([]);
      setAuthState("no_team");
      toastWarning(etm.noTeamInPoolTitle || editMyTeamTabFallback.noTeamInPoolTitle, {
        description: etm.noTeamInPoolDescription || editMyTeamTabFallback.noTeamInPoolDescription,
      });
    } else {
      setMyTeam(team);
      setEditNaam(team.naam || "");
      setEditTeamnaam(team.teamnaam || "");
      await applyTeamRosterAndHydrate(team);
      setAuthState("authenticated");
    }
  }

  async function sendMagicLink() {
    setAuthError("");
    setAuthState("sending");
    try {
      var email = emailInput.trim();
      if (!email) {
        setAuthState("unauthenticated");
        return;
      }
      // Always proxy through our API — same as legacy index flow. Browser supabase-js
      // signInWithOtp can hit `/auth/v1/otp` in a form that returns 500 (e.g. GET + redirect_to).
      await authSendMagicLink(email);
      setAuthState("sent");
    } catch (e) {
      setAuthError(e.message || String(e));
      setAuthState("unauthenticated");
    }
  }

  async function finishPasswordFlowSession(sess) {
    var expiresAt =
      sess.expires_at ??
      Math.floor(Date.now() / 1000) + (typeof sess.expires_in === "number" ? sess.expires_in : 3600);
    var sb = getSupabaseBrowser();
    if (sb && sess.refresh_token) {
      try {
        await sb.auth.setSession({
          access_token: sess.access_token,
          refresh_token: sess.refresh_token,
        });
      } catch (_) {
        /* optional */
      }
    }
    await loadTeamForSession({
      access_token: sess.access_token,
      refresh_token: sess.refresh_token || "",
      expires_at: expiresAt,
      user: sess.user || {},
    });
  }

  async function submitPasswordEmailAuth() {
    setAuthError("");
    setAuthState("sending");
    try {
      if (alreadyHaveAccount) {
        var loginData = await authSignInWithPassword(pwEmail.trim(), pwPassword);
        await finishPasswordFlowSession(loginData);
        return;
      }
      if (pwPassword.length < 6) {
        throw new Error("Choose a password of at least 6 characters.");
      }
      var up = await authSignUp(pwEmail.trim(), pwPassword, getSupabaseAuthRedirectOrigin());
      if (up.hasSession) {
        await finishPasswordFlowSession({
          access_token: up.access_token,
          refresh_token: up.refresh_token,
          expires_at: up.expires_at,
          expires_in: undefined,
          user: up.user,
        });
      } else {
        setAuthState("signup_check_email");
      }
    } catch (e) {
      setAuthError(formatSupabaseAuthError(e));
      setAuthState("unauthenticated");
    }
  }

  async function googleLogin() {
    setAuthError("");
    var sb = getSupabaseBrowser();
    if (!sb) {
      setAuthError("Add NEXT_PUBLIC_SUPABASE_ANON_KEY and enable Google in Supabase Auth.");
      return;
    }
    var redirect = getSupabaseAuthRedirectOrigin();
    if (!redirect) {
      setAuthError("Cannot resolve redirect URL.");
      return;
    }
    var res = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect } });
    if (res.error) setAuthError(res.error.message || String(res.error));
  }

  async function sendLoginLinkAsSignupFallback() {
    setAuthError("");
    setSignupFallbackBusy(true);
    try {
      await authSendMagicLink(pwEmail.trim());
      setEmailInput(pwEmail.trim());
      setAuthState("sent");
    } catch (e) {
      setAuthError(e.message || String(e));
    } finally {
      setSignupFallbackBusy(false);
    }
  }

  async function signOut() {
    const s = authLoadSession();
    await authSignOut(s && s.access_token);
    lastSessionUserKeyRef.current = "";
    setSession(null);
    setMyTeam(null);
    setPublicComps([]);
    setCompetitionSelectId("");
    setSquadRoster([]);
    setAuthState("unauthenticated");
    setEmailInput("");
  }

  async function saveChanges() {
    if (teamEditLocked) return;
    setSaving(true);
    try {
      await dbBijwerkenVeld(myTeam.id, {
        naam: editNaam.trim(),
        teamnaam: editTeamnaam.trim(),
        spelers: JSON.stringify(
          editSpelers.map(function(row) {
            if (!row || typeof row !== "object") return row;
            var o = Object.assign({}, row);
            delete o.player_id;
            return o;
          }),
        ),
      });
      await reloadParticipants();
      setSaved(true);
      setTimeout(function(){ setSaved(false); }, 2500);
    } catch(e) {
      toastError("Error saving: " + (e && e.message ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  // ── RENDER ──────────────────────────────────────────────────

  if (authState === "loading") {
    return <div className="card" style={{textAlign:"center",padding:40,color:"var(--fg-muted)"}}>Loading…</div>;
  }

  if (globalDeadlinePassed && authState !== "authenticated") {
    return (
      <div className="card" style={{textAlign:"center",padding:"40px 20px"}}>
        <div style={{fontSize:48,marginBottom:16}}>🔒</div>
        <div style={{fontFamily:"var(--wk-heading-font)",fontSize:24,marginBottom:8}}>Deadline passed</div>
        <div style={{color:"var(--fg-muted)"}}>The registration deadline has passed. Teams can no longer be edited.</div>
      </div>
    );
  }

  if (authState === "unauthenticated" || authState === "sending") {
    return (
      <div>
        <div className="card-title">My Team</div>
        <div className="card" style={{maxWidth:480}}>
          <div style={{fontFamily:"var(--wk-heading-font)",fontSize:16,letterSpacing:"0.05em",color:"var(--orange)",marginBottom:10}}>
            Sign in to edit your team
          </div>

          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
            <button
              type="button"
              className={authLoginMode === "magic" ? "btn" : "btn btn-outline"}
              onClick={function(){ setAuthLoginMode("magic"); setAuthError(""); }}
              style={{fontSize:12,padding:"6px 12px"}}
            >Email link</button>
            <button
              type="button"
              className={authLoginMode === "password" ? "btn" : "btn btn-outline"}
              onClick={function(){
                setAuthLoginMode("password");
                setAuthError("");
              }}
              style={{fontSize:12,padding:"6px 12px"}}
            >Email + password</button>
            {supabaseEnabled ? (
              <button
                type="button"
                className={authLoginMode === "google" ? "btn" : "btn btn-outline"}
                onClick={function(){ setAuthLoginMode("google"); setAuthError(""); }}
                style={{fontSize:12,padding:"6px 12px"}}
              >Google</button>
            ) : null}
          </div>

          {!supabaseEnabled ? (
            <p style={{fontSize:12,color:"var(--fg-muted)",marginBottom:12,lineHeight:1.5}}>
              Add <code style={{fontSize:11}}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> for Google OAuth. Magic link and email/password use{" "}
              <code style={{fontSize:11}}>NEXT_PUBLIC_API_BASE</code>.
            </p>
          ) : null}

          {authLoginMode === "magic" ? (
            <React.Fragment>
              <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:16,lineHeight:1.6}}>
                Enter the email you used to register. We’ll send a login link via the app API (Supabase Auth) — same email as your team registration.
              </p>
              <label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:6}}>Email address</label>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={emailInput}
                  onChange={function(e){ setEmailInput(e.target.value); }}
                  onKeyDown={function(e){ if(e.key==="Enter" && emailInput.trim()) sendMagicLink(); }}
                  style={{flex:1,minWidth:200,margin:0}}
                  disabled={authState === "sending"}
                />
                <button className="btn" onClick={sendMagicLink} disabled={authState === "sending" || !emailInput.trim()}>
                  {authState === "sending" ? "Sending…" : "Send login link →"}
                </button>
              </div>
            </React.Fragment>
          ) : authLoginMode === "password" ? (
            <React.Fragment>
              <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:12,lineHeight:1.6}}>
                {alreadyHaveAccount
                  ? "Sign in through the app API (password must exist on your Supabase Auth account)."
                  : "Create a login password only after you have registered your team on the Register tab with this same email. The server checks your email exists in the competition list before sign-up."}
              </p>
              <label
                style={{
                  display:"flex",
                  alignItems:"center",
                  gap:10,
                  marginBottom:14,
                  cursor:"pointer",
                  fontSize:13,
                  color:"var(--fg)",
                }}
              >
                <input
                  type="checkbox"
                  checked={alreadyHaveAccount}
                  onChange={function(e){
                    setAlreadyHaveAccount(e.target.checked);
                    setAuthError("");
                  }}
                  style={{margin:0,width:16,height:16,accentColor:"var(--orange)"}}
                />
                <span>I already have an account</span>
              </label>
              <label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:6}}>Email</label>
              <input
                type="email"
                value={pwEmail}
                onChange={function(e){ setPwEmail(e.target.value); }}
                style={{margin:"0 0 10px 0",width:"100%",maxWidth:360}}
                disabled={authState === "sending"}
              />
              <label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:6}}>Password</label>
              <input
                type="password"
                value={pwPassword}
                onChange={function(e){ setPwPassword(e.target.value); }}
                onKeyDown={function(e){
                  if(e.key==="Enter" && pwEmail.trim() && (alreadyHaveAccount || pwPassword.length >= 6)) submitPasswordEmailAuth();
                }}
                style={{margin:"0 0 14px 0",width:"100%",maxWidth:360}}
                disabled={authState === "sending"}
              />
              <button
                className="btn"
                onClick={submitPasswordEmailAuth}
                disabled={
                  authState === "sending" ||
                  !pwEmail.trim() ||
                  (!alreadyHaveAccount && pwPassword.length < 6)
                }
              >
                {authState === "sending"
                  ? alreadyHaveAccount
                    ? "Signing in…"
                    : "Creating account…"
                  : alreadyHaveAccount
                    ? "Sign in"
                    : "Create account"}
              </button>
            </React.Fragment>
          ) : supabaseEnabled ? (
            <React.Fragment>
              <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:16,lineHeight:1.6}}>
                Continue with Google (enable provider + OAuth client in Supabase; add redirect URL below to allowed list).
              </p>
              <button type="button" className="btn" onClick={googleLogin}>Continue with Google</button>
              <div style={{fontSize:11,color:"var(--fg-muted)",marginTop:12,lineHeight:1.4}}>
                Allowed redirect URL:{" "}
                <code style={{fontSize:10}}>{typeof window !== "undefined" ? getSupabaseAuthRedirectOrigin() || "…" : "…"}</code>
              </div>
            </React.Fragment>
          ) : null}

          {authError && <div style={{color:"#EF4444",fontSize:13,marginTop:10}}>⚠️ {authError}</div>}
        </div>
      </div>
    );
  }

  if (authState === "sent") {
    return (
      <div>
        <div className="card-title">My Team</div>
        <div className="card" style={{maxWidth:480,textAlign:"center",padding:"32px 24px"}}>
          <div style={{fontSize:48,marginBottom:12}}>📧</div>
          <div style={{fontFamily:"var(--wk-heading-font)",fontSize:20,marginBottom:8}}>Check your email!</div>
          <p style={{fontSize:13,color:"var(--fg-muted)",lineHeight:1.6}}>
            We sent a login link to <strong>{emailInput}</strong>.<br/>
            Click the link in the email to continue. The link expires in 1 hour.
          </p>
          <button className="btn btn-outline" style={{marginTop:20}} onClick={function(){ setAuthState("unauthenticated"); }}>
            ← Use different email
          </button>
        </div>
      </div>
    );
  }

  if (authState === "pick_competition") {
    return (
      <div>
        <div className="card-title">My Team</div>
        <div className="card" style={{maxWidth:480}}>
          <div style={{fontFamily:"var(--wk-heading-font)",fontSize:16,letterSpacing:"0.05em",color:"var(--orange)",marginBottom:10}}>
            {etm.pickCompetitionTitle}
          </div>
          <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:10,lineHeight:1.6}}>{etm.pickCompetitionIntro}</p>
          <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:14,lineHeight:1.6}}>{etm.pickCompetitionRemember}</p>
          {competitionsLoading ? (
            <div style={{fontSize:13,color:"var(--fg-muted)"}}>Loading your pools…</div>
          ) : publicComps.length === 0 ? (
            <React.Fragment>
              <p style={{fontSize:13,color:"var(--fg-muted)",lineHeight:1.6,marginBottom:14}}>
                No pools yet. Join one from <strong>Participate</strong> or accept an invitation, then return here.
              </p>
              <button type="button" className="btn btn-outline" onClick={signOut}>
                Log out
              </button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:6}}>Competition</label>
              <select
                value={competitionSelectId}
                onChange={function(e){ setCompetitionSelectId(e.target.value); }}
                style={{width:"100%",maxWidth:360,marginBottom:14}}
              >
                <option value="">Select…</option>
                {publicComps.map(function(c) {
                  var id = c.id;
                  var label = (c.name || c.slug || "Pool") + (c.season_label ? " · " + c.season_label : "");
                  return (
                    <option key={String(id)} value={String(id)}>{label}</option>
                  );
                })}
              </select>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                <button
                  type="button"
                  className="btn"
                  disabled={!competitionSelectId}
                  onClick={confirmPickCompetition}
                >
                  Continue →
                </button>
                <button type="button" className="btn btn-outline" onClick={signOut}>
                  Log out
                </button>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    );
  }

  if (authState === "signup_check_email") {
    return (
      <div>
        <div className="card-title">My Team</div>
        <div className="card" style={{maxWidth:480,textAlign:"center",padding:"32px 24px"}}>
          <div style={{fontSize:48,marginBottom:12}}>📧</div>
          <div style={{fontFamily:"var(--wk-heading-font)",fontSize:20,marginBottom:8}}>Confirm your email</div>
          <p style={{fontSize:13,color:"var(--fg-muted)",lineHeight:1.6}}>
            We created an account for <strong>{pwEmail}</strong>. Supabase should send a confirmation email — check spam/promotions too.<br /><br />
            If nothing arrives, use <strong>Send login link</strong> below (same mail pipeline as Email link sign-in). After you confirm or open the link, return here and sign in with &quot;I already have an account&quot;.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:20,alignItems:"stretch"}}>
            <button type="button" className="btn" onClick={sendLoginLinkAsSignupFallback} disabled={signupFallbackBusy}>
              {signupFallbackBusy ? "Sending…" : "Send login link to this email"}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={function(){
                setAuthState("unauthenticated");
                setAlreadyHaveAccount(true);
              }}
            >
              ← Back to sign in
            </button>
          </div>
          {authError && <div style={{color:"#EF4444",fontSize:13,marginTop:12}}>⚠️ {authError}</div>}
          <p style={{fontSize:11,color:"var(--fg-muted)",marginTop:16,lineHeight:1.5}}>
            Tip: In Supabase → Authentication → Providers → Email, you can disable &quot;Confirm email&quot; for development so sign-up logs you in immediately.
          </p>
        </div>
      </div>
    );
  }

  if (authState === "no_team") {
    var st = typeof window !== "undefined" ? readSelectedCompetition() : null;
    var poolLabel = st && st.name ? st.name : "this competition";
    return (
      <div>
        <div className="card-title">My Team</div>
        <div className="card" style={{maxWidth:480}}>
          <p style={{fontSize:14,marginBottom:16}}>
            No team registered for <strong>{poolLabel}</strong> with{" "}
            <strong>{session && session.user && session.user.email}</strong>.
          </p>
          <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:16}}>
            Register on the Register tab for this pool, or choose another competition.
          </p>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button
              className="btn btn-outline"
              onClick={function(){
                setCompetitionSelectId("");
                setAuthState("pick_competition");
              }}
            >
              Choose competition
            </button>
            <button className="btn btn-outline" onClick={signOut}>Log out</button>
          </div>
        </div>
      </div>
    );
  }

  // authenticated — show team editor
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div className="card-title" style={{margin:0}}>My Team</div>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          {publicComps.length > 0 ? (
            <label style={{fontSize:12,color:"var(--fg-muted)",display:"flex",alignItems:"center",gap:8}}>
              <span>Competition</span>
              <select
                value={String((myTeam && myTeam.competition_id) || (readSelectedCompetition() && readSelectedCompetition().id) || "")}
                onChange={function(e){ switchCompetition(e.target.value); }}
                style={{fontSize:12,maxWidth:220}}
                disabled={teamEditLocked}
              >
                {publicComps.map(function(c) {
                  var label = (c.name || c.slug || "Pool") + (c.season_label ? " · " + c.season_label : "");
                  return <option key={String(c.id)} value={String(c.id)}>{label}</option>;
                })}
              </select>
            </label>
          ) : null}
          <span style={{fontSize:12,color:"var(--fg-muted)"}}>
            Logged in as <strong>{session && session.user && session.user.email}</strong>
          </span>
          <button className="btn btn-outline" onClick={signOut} style={{fontSize:12,padding:"6px 12px"}}>Log out</button>
        </div>
      </div>

      {teamEditLocked && (
        <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid #EF4444",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#DC2626"}}>
          🔒 The registration deadline has passed. Your team is now locked and cannot be changed.
        </div>
      )}

      {/* Basic info */}
      <div className="card" style={{marginBottom:14}}>
        <div style={{fontFamily:"var(--wk-heading-font)",fontSize:15,marginBottom:12,letterSpacing:"0.05em",color:"var(--orange)"}}>Team info</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <label style={{fontSize:11}}>Your name</label>
            <input type="text" value={editNaam} onChange={function(e){ setEditNaam(e.target.value); }} style={{margin:0}} disabled={teamEditLocked}/>
          </div>
          <div>
            <label style={{fontSize:11}}>Team name</label>
            <input type="text" value={editTeamnaam} onChange={function(e){ setEditTeamnaam(e.target.value); }} style={{margin:0}} disabled={teamEditLocked}/>
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="card" style={{marginBottom:14}}>
        <div style={{fontFamily:"var(--wk-heading-font)",fontSize:15,marginBottom:12,letterSpacing:"0.05em",color:"var(--orange)"}}>Players & Coach</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {editSpelers.map(function(sp, i) {
            if (!sp || !sp.land) return null;
            const isCoach = sp.positie === "coach";
            const curPid = resolvePlayerIdFromLegacyRow(sp, squadRoster);
            const selVal = curPid != null ? String(curPid) : "";
            const fieldOpts = isCoach ? [] : rosterFieldOptionsForSlot(squadRoster, sp);
            const idInFieldOpts = !isCoach && fieldOpts.some(function(o) {
              return o && Math.floor(Number(o.player_id)) === curPid;
            });
            const idInCoachOpts =
              isCoach &&
              squadCoachOptions.some(function(o) {
                return o && Math.floor(Number(o.player_id)) === curPid;
              });
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--bg-3)",borderRadius:8,flexWrap:"wrap"}}>
                <div style={{width:80,flexShrink:0}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"var(--orange)",letterSpacing:"0.05em"}}>{t.pos[sp.positie] || sp.positie}</div>
                  <div style={{fontSize:12,color:"var(--fg-muted)"}}>{flag(sp.land)} {sp.land}</div>
                </div>
                {!teamEditLocked ? (
                  isCoach ? (
                    <select
                      value={selVal}
                      onChange={function(e) {
                        applyRosterPickToRow(i, e.target.value, squadRoster);
                      }}
                      style={{flex:1,margin:0,fontSize:13}}
                    >
                      <option value="">— Choose coach —</option>
                      {!idInCoachOpts && curPid != null ? (
                        <option value={String(curPid)}>
                          {(sp.spelerNaam && String(sp.spelerNaam).trim()) || "—"} — {sp.land}
                        </option>
                      ) : null}
                      {squadCoachOptions.map(function(c) {
                        var pid = Math.floor(Number(c.player_id));
                        var lab = (c.name || "—") + " — " + (c.team || "");
                        return (
                          <option key={"c" + String(pid)} value={String(pid)}>
                            {lab}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <select
                      value={selVal}
                      onChange={function(e) {
                        applyRosterPickToRow(i, e.target.value, squadRoster);
                      }}
                      style={{flex:1,margin:0,fontSize:13}}
                    >
                      <option value="">— Choose player —</option>
                      {!idInFieldOpts && curPid != null ? (
                        <option value={String(curPid)}>
                          {(sp.spelerNaam && String(sp.spelerNaam).trim()) || "—"} · {sp.land}
                        </option>
                      ) : null}
                      {fieldOpts.map(function(o) {
                        var pid = Math.floor(Number(o.player_id));
                        var lab = (o.name || "—") + " — " + (o.team || "");
                        return (
                          <option key={"p" + String(pid)} value={String(pid)}>
                            {lab}
                          </option>
                        );
                      })}
                    </select>
                  )
                ) : (
                  <span style={{flex:1,fontSize:13,color:"var(--fg)"}}>{sp.spelerNaam || "—"}</span>
                )}
                {sp.aanvoerder && <CaptainBand size={22}/>}
              </div>
            );
          })}
        </div>
      </div>

      {!teamEditLocked && (
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn" onClick={saveChanges} disabled={saving} style={{minWidth:140}}>
            {saving ? "Saving…" : saved ? "✓ Saved!" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

