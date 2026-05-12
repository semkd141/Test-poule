"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity -- mirrors register-tab.jsx (data load + wall-clock deadline) */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useApp } from "../poule-context.jsx";
import { FORMATIONS, flag } from "../../../lib/wk/tournament";
import {
  authGetValidSession,
  dbToevoegen,
  dbBijwerkenVeld,
  joinCompetition,
  listMyRegisterableCompetitions,
  persistSupabaseSessionToWkStorage,
  readSelectedCompetition,
  writeSelectedCompetition,
  consumeRegisterSkipCompetitionStep,
  fetchPublicCompetitionSquadRoster,
  fetchParticipantPlayerRollups,
  patchParticipantPlayerRollups,
  getMyDeelnemer,
} from "../../../lib/wk/api-client";
import { getSupabaseBrowser } from "../../../lib/wk/supabase-browser";
import { toastWarning } from "../../../lib/wk/toast";
import { CaptainBand } from "./teams/captain-band.jsx";
import { CountryPicker } from "./country-picker.jsx";

/** @typedef {{ player_id: number; name: string | null; team: string | null; pos: string | null }} RosterPick */

function isCoachPos(pos) {
  return String(pos || "")
    .trim()
    .toLowerCase() === "coach";
}

/** API-Football lineup `player.pos` is typically G / D / M / F (see `backend/fixture.json`). */
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

function slotHasRealPlayer(x) {
  if (!x) return false;
  var pid = Math.floor(Number(x.player_id));
  return Number.isFinite(pid) && pid > 0;
}

function emptySlots(formation) {
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

function rollupsIntoSlots(rollups, rosterById, formation) {
  const sp = emptySlots(formation);
  const coachRows = rollups.filter(function(r) {
    return isCoachPos(r.pos);
  });
  const field = rollups.filter(function(r) {
    return !isCoachPos(r.pos);
  });
  var i = 0;
  if (sp.keeper.length) sp.keeper[0] = mapPick(field[i++], rosterById);
  for (var d = 0; d < sp.def.length; d++) {
    sp.def[d] = mapPick(field[i++], rosterById);
  }
  for (var m = 0; m < sp.mid.length; m++) {
    sp.mid[m] = mapPick(field[i++], rosterById);
  }
  for (var a = 0; a < sp.att.length; a++) {
    sp.att[a] = mapPick(field[i++], rosterById);
  }
  if (coachRows.length && sp.coach.length) {
    sp.coach[0] = mapPick(coachRows[0], rosterById);
  }
  var cap = null;
  var capRow = rollups.find(function(r) {
    return r.is_captain === true && !isCoachPos(r.pos);
  });
  if (capRow && capRow.player_id != null) {
    var pid = Math.floor(Number(capRow.player_id));
    if (Number.isFinite(pid) && pid > 0) {
      var order = ["keeper", "def", "mid", "att"];
      outer: for (var oi = 0; oi < order.length; oi++) {
        var p = order[oi];
        var arr = sp[p] || [];
        for (var ii = 0; ii < arr.length; ii++) {
          var slot = arr[ii];
          if (slot && slot.player_id === pid) {
            cap = { pos: p, index: ii };
            break outer;
          }
        }
      }
    }
  }
  return { slots: sp, captain: cap };
}

function mapPick(rollupRow, rosterById) {
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

export function RegisterTab2() {
  const { t, config, reloadParticipants, inviteRegistration, clearInviteRegistration, setTab } = useApp();
  const [form, setForm] = useState({ naam: "", teamnaam: "", email: "", systeem: "4-3-3" });
  const [spelers, setSpelers] = useState(emptySlots(FORMATIONS["4-3-3"]));
  const [captain, setCaptain] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openPicker, setOpenPicker] = useState(null);
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [existingTeamId, setExistingTeamId] = useState(null);

  var registeringForInvite =
    inviteRegistration && typeof inviteRegistration.competitionId === "number";
  const formation = FORMATIONS[form.systeem];

  const [step, setStep] = useState(registeringForInvite ? 1 : 0);
  const [publicComps, setPublicComps] = useState([]);
  const [compsLoading, setCompsLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [compSelectId, setCompSelectId] = useState("");
  const [handleNextBusy, setHandleNextBusy] = useState(false);

  useEffect(
    function() {
      if (!inviteRegistration || typeof inviteRegistration.competitionId !== "number") return;
      writeSelectedCompetition({
        id: inviteRegistration.competitionId,
        name: inviteRegistration.name || "Pool",
      });
    },
    [inviteRegistration],
  );

  useEffect(
    function() {
      if (registeringForInvite) return undefined;
      var sb = getSupabaseBrowser();
      if (!sb) return undefined;
      var r = sb.auth.onAuthStateChange(function(_evt, sess) {
        if (sess && sess.access_token && sess.user) {
          persistSupabaseSessionToWkStorage({
            access_token: sess.access_token,
            refresh_token: sess.refresh_token,
            expires_at: sess.expires_at,
            expires_in: sess.expires_in,
            user: sess.user,
          });
        }
      });
      return function() {
        if (r && r.data && r.data.subscription) r.data.subscription.unsubscribe();
      };
    },
    [registeringForInvite],
  );

  useEffect(
    function() {
      if (registeringForInvite) return;
      var cancelled = false;
      setCompsLoading(true);
      authGetValidSession()
        .then(function(sess) {
          if (cancelled) return;
          if (!sess || !sess.access_token) {
            setSignedIn(false);
            setPublicComps([]);
            setCompsLoading(false);
            return;
          }
          setSignedIn(true);
          return listMyRegisterableCompetitions()
            .then(function(rows) {
              if (cancelled) return;
              setPublicComps(Array.isArray(rows) ? rows : []);
              var st = readSelectedCompetition();
              if (st && st.id) setCompSelectId(String(st.id));
            })
            .catch(function() {
              if (!cancelled) setPublicComps([]);
            })
            .finally(function() {
              if (!cancelled) setCompsLoading(false);
            });
        })
        .catch(function() {
          if (!cancelled) {
            setSignedIn(false);
            setPublicComps([]);
            setCompsLoading(false);
          }
        });
      return function() {
        cancelled = true;
      };
    },
    [registeringForInvite],
  );

  useEffect(
    function() {
      if (inviteRegistration && typeof inviteRegistration.competitionId === "number") {
        setStep(1);
      }
    },
    [inviteRegistration],
  );

  useEffect(
    function() {
      if (registeringForInvite) return;
      if (!consumeRegisterSkipCompetitionStep()) return;
      var sel = readSelectedCompetition();
      if (sel && sel.id) {
        setCompSelectId(String(sel.id));
        setStep(1);
        authGetValidSession().then(function(sess) {
          if (!sess || !sess.access_token) return;
          joinCompetition(sel.id).catch(function(err) {
            setError(String(err && err.message ? err.message : err));
          });
        });
      }
    },
    [registeringForInvite],
  );

  useEffect(
    function() {
      if (registeringForInvite) return undefined;
      if (step < 1) return undefined;
      var sb = getSupabaseBrowser();
      if (!sb) return undefined;
      var r = sb.auth.onAuthStateChange(function(_evt, sess) {
        if (!sess || !sess.access_token) return;
        var sel = readSelectedCompetition();
        if (!sel || !sel.id) return;
        joinCompetition(sel.id).catch(function(err) {
          setError(String(err && err.message ? err.message : err));
        });
      });
      return function() {
        if (r && r.data && r.data.subscription) r.data.subscription.unsubscribe();
      };
    },
    [step, registeringForInvite],
  );

  useEffect(
    function() {
      if (registeringForInvite) return;
      if (compsLoading || !signedIn) return;
      if (step < 1) return;
      var sel = readSelectedCompetition();
      if (!sel || sel.id == null || sel.id === "") return;
      var cid = Number(sel.id);
      if (!Number.isFinite(cid) || cid <= 0) return;
      var ok = publicComps.some(function(c) {
        return Number(c.id) === cid;
      });
      if (ok) return;
      setStep(0);
      setCompSelectId("");
      setError(t.registerOnlyNonOwnedPools || "");
    },
    [registeringForInvite, signedIn, compsLoading, step, publicComps, t],
  );

  const deadlinePassed = useMemo(
    function() {
      if (registeringForInvite) return false;
      if (!registeringForInvite && step === 0 && compSelectId) {
        var crow = publicComps.find(function(c) {
          return Number(c.id) === parseInt(compSelectId, 10);
        });
        if (crow && typeof crow.registration_open === "boolean") return !crow.registration_open;
        if (crow && crow.registration_deadline) {
          var t0 = new Date(crow.registration_deadline).getTime();
          if (!Number.isNaN(t0)) return Date.now() > t0;
        }
      }
      var sel = readSelectedCompetition();
      if (step >= 1 && sel && typeof sel.registration_open === "boolean") return !sel.registration_open;
      if (step >= 1 && sel && sel.registration_deadline) {
        var t1 = new Date(sel.registration_deadline).getTime();
        if (!Number.isNaN(t1)) return Date.now() > t1;
      }
      return Date.now() > config.deadline.getTime();
    },
    [registeringForInvite, config.deadline, step, compSelectId, publicComps],
  );

  useEffect(
    function() {
      if (step === 2) return undefined;
      setSpelers(emptySlots(formation));
      setCaptain(null);
    },
    [form.systeem, formation.keeper, formation.def, formation.mid, formation.att, step],
  );

  useEffect(
    function() {
      var cancelled = false;
      authGetValidSession().then(function(sess) {
        if (cancelled || !sess) return;
        var u = sess.user;
        var em =
          u && typeof u === "object" && typeof u.email === "string" ? u.email.trim() : "";
        if (!em) return;
        setForm(function(prev) {
          if (prev.email && prev.email.trim()) return prev;
          return Object.assign({}, prev, { email: em });
        });
      });
      return function() {
        cancelled = true;
      };
    },
    []);

  function resolveCompetitionId() {
    if (registeringForInvite && typeof inviteRegistration.competitionId === "number") {
      return inviteRegistration.competitionId;
    }
    var fromSelect = parseInt(String(compSelectId || "").trim(), 10);
    var sel = readSelectedCompetition();
    var fromSession = sel && sel.id != null ? Number(sel.id) : NaN;
    var cid = Number.isFinite(fromSelect) && fromSelect > 0 ? fromSelect : fromSession;
    return Number.isFinite(cid) && cid > 0 ? cid : null;
  }

  const loadStep2Data = useCallback(async function() {
    var cid = resolveCompetitionId();
    if (cid == null) return;
    setRosterLoading(true);
    setError("");
    setExistingTeamId(null);
    try {
      var rows = await fetchPublicCompetitionSquadRoster(cid);
      setRoster(Array.isArray(rows) ? rows : []);
      var rosterById = new Map(
        (Array.isArray(rows) ? rows : []).map(function(r) {
          return [r.player_id, r];
        }),
      );
      var sess = await authGetValidSession();
      var email = sess && sess.user && typeof sess.user.email === "string" ? sess.user.email.trim() : "";
      if (!email) {
        setSpelers(emptySlots(formation));
        return;
      }
      var team = await getMyDeelnemer(email, cid);
      if (team && team.id != null) {
        var tid = Math.floor(Number(team.id));
        if (Number.isFinite(tid) && tid > 0) {
          setExistingTeamId(tid);
          var roll = await fetchParticipantPlayerRollups(tid);
          if (Array.isArray(roll) && roll.length) {
            var mapped = rollupsIntoSlots(roll, rosterById, formation);
            setSpelers(mapped.slots);
            setCaptain(mapped.captain);
          } else {
            setSpelers(emptySlots(formation));
            setCaptain(null);
          }
          if (team.naam) setForm(function(prev) {
            return Object.assign({}, prev, { naam: String(team.naam) });
          });
          if (team.teamnaam) setForm(function(prev) {
            return Object.assign({}, prev, { teamnaam: String(team.teamnaam) });
          });
          if (team.systeem) setForm(function(prev) {
            return Object.assign({}, prev, { systeem: String(team.systeem) });
          });
          return;
        }
      }
      setSpelers(emptySlots(formation));
      setCaptain(null);
    } catch (e) {
      setError(String(e && e.message ? e.message : e));
      setRoster([]);
      setSpelers(emptySlots(formation));
    } finally {
      setRosterLoading(false);
    }
  }, [registeringForInvite, inviteRegistration, compSelectId, formation]);

  useEffect(
    function() {
      if (step !== 2) return undefined;
      var cancelled = false;
      loadStep2Data().then(function() {
        if (cancelled) return;
      });
      return function() {
        cancelled = true;
      };
    },
    [step, loadStep2Data],
  );

  const rosterById = useMemo(
    function() {
      return new Map(roster.map(function(r) {
        return [r.player_id, r];
      }));
    },
    [roster],
  );

  const coachOptions = useMemo(
    function() {
      return roster.filter(function(p) {
        return isCoachPos(p.pos);
      });
    },
    [roster],
  );

  const distinctTeamNames = useMemo(
    function() {
      var s = new Set();
      roster.forEach(function(p) {
        if (p.team && String(p.team).trim() && !isCoachPos(p.pos)) s.add(String(p.team).trim());
      });
      return Array.from(s).sort(function(a, b) {
        return a.localeCompare(b);
      });
    },
    [roster],
  );

  const selfTaken = useMemo(
    function() {
      var s = new Set();
      ["keeper", "def", "mid", "att"].forEach(function(pos) {
        (spelers[pos] || []).forEach(function(x) {
          if (x && x.team) s.add(String(x.team).trim());
        });
      });
      var ch = spelers.coach && spelers.coach[0];
      if (ch && ch.team) s.add(String(ch.team).trim());
      return s;
    },
    [spelers],
  );

  const teamPickerTaken = useMemo(
    function() {
      if (!openPicker) return selfTaken;
      var s = new Set(selfTaken);
      var row = spelers[openPicker.pos] && spelers[openPicker.pos][openPicker.index];
      if (row && row.team) s.delete(String(row.team).trim());
      return s;
    },
    [openPicker, selfTaken, spelers],
  );

  useEffect(
    function() {
      if (step !== 2) setOpenPicker(null);
    },
    [step],
  );

  if (deadlinePassed) {
    return (
      <div className="card">
        <div className="empty-state" style={{ color: "var(--orange)" }}>
          {t.deadlinePassed}
        </div>
      </div>
    );
  }
  if (success) {
    return (
      <div className="card">
        <div className="success">{t.successReg}</div>
      </div>
    );
  }

  function rememberCompetitionForEdit(compId) {
    var cid = Math.floor(Number(compId));
    if (!Number.isFinite(cid) || cid <= 0) return;
    var crow = publicComps.find(function(c) {
      return Number(c.id) === cid;
    });
    var sel = readSelectedCompetition();
    var inviteName =
      registeringForInvite &&
      inviteRegistration &&
      typeof inviteRegistration.competitionId === "number" &&
      Number(inviteRegistration.competitionId) === cid
        ? inviteRegistration.name
        : null;
    var name =
      crow && crow.name
        ? String(crow.name)
        : inviteName
          ? String(inviteName)
          : sel && sel.name
            ? String(sel.name)
            : "Pool";
    writeSelectedCompetition({
      id: cid,
      name: name,
      slug: crow && crow.slug ? String(crow.slug) : sel && sel.slug ? String(sel.slug) : undefined,
      registration_deadline:
        crow && typeof crow.registration_deadline === "string"
          ? crow.registration_deadline
          : sel && typeof sel.registration_deadline === "string"
            ? sel.registration_deadline
            : undefined,
      registration_open:
        crow && typeof crow.registration_open === "boolean"
          ? crow.registration_open
          : sel && typeof sel.registration_open === "boolean"
            ? sel.registration_open
            : undefined,
    });
  }

  function advanceAfterCompetitionChosen(cid0, sess) {
    var crow = publicComps.find(function(c) {
      return Number(c.id) === cid0;
    });
    writeSelectedCompetition({
      id: cid0,
      name: crow && crow.name ? String(crow.name) : "Pool",
      slug: crow && crow.slug ? String(crow.slug) : undefined,
      registration_deadline:
        crow && typeof crow.registration_deadline === "string" ? crow.registration_deadline : undefined,
      registration_open:
        crow && typeof crow.registration_open === "boolean" ? crow.registration_open : undefined,
    });
    setStep(1);
    if (sess && sess.access_token) {
      joinCompetition(cid0).catch(function(err) {
        setError(String(err && err.message ? err.message : err));
      });
    }
  }

  function handleNext() {
    setError("");
    if (!registeringForInvite && step === 0) {
      var cid0 = parseInt(compSelectId, 10);
      if (!Number.isFinite(cid0) || cid0 <= 0) return setError("Kies een competitie.");
      setHandleNextBusy(true);
      authGetValidSession()
        .then(function(sess) {
          var email = sess && sess.user && typeof sess.user.email === "string" ? sess.user.email.trim() : "";
          if (!email) {
            advanceAfterCompetitionChosen(cid0, sess);
            return;
          }
          return getMyDeelnemer(email, cid0).then(function(team) {
            var tid = team && team.id != null ? Math.floor(Number(team.id)) : NaN;
            if (Number.isFinite(tid) && tid > 0) {
              var dupMsg = t.duplicateRegistration || t.duplicateEmail || "Already registered in this pool.";
              toastWarning(dupMsg, { description: t.registerDuplicateToastHint || undefined });
              setError(dupMsg);
              rememberCompetitionForEdit(cid0);
              setTab("edit");
              return;
            }
            advanceAfterCompetitionChosen(cid0, sess);
          });
        })
        .catch(function() {
          return authGetValidSession().then(function(sess) {
            advanceAfterCompetitionChosen(cid0, sess);
          });
        })
        .finally(function() {
          setHandleNextBusy(false);
        });
      return;
    }
    if (!form.naam.trim()) return setError("Vul je naam in");
    if (!form.teamnaam.trim()) return setError("Vul een teamnaam in");
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return setError("Geldig e-mailadres vereist");
    }
    var cidDup = resolveCompetitionId();
    if (cidDup == null) {
      return setError("Kies een competitie (stap 1).");
    }
    setHandleNextBusy(true);
    getMyDeelnemer(form.email.trim(), cidDup)
      .then(function(team) {
        var tid = team && team.id != null ? Math.floor(Number(team.id)) : NaN;
        if (Number.isFinite(tid) && tid > 0) {
          var dupMsg2 = t.duplicateRegistration || t.duplicateEmail || "Already registered in this pool.";
          toastWarning(dupMsg2, { description: t.registerDuplicateToastHint || undefined });
          setError(dupMsg2);
          rememberCompetitionForEdit(cidDup);
          setTab("edit");
          return;
        }
        setStep(2);
      })
      .catch(function() {
        setStep(2);
      })
      .finally(function() {
        setHandleNextBusy(false);
      });
  }

  function playersForTeamAtSlot(teamName, formationSlot) {
    var c = String(teamName || "").trim();
    if (!c) return [];
    return roster.filter(function(p) {
      return (
        !isCoachPos(p.pos) &&
        String(p.team || "").trim() === c &&
        rosterPosMatchesFormationSlot(p.pos, formationSlot)
      );
    });
  }

  function pickTeamForSlot(pos, index, teamName) {
    setSpelers(function(prev) {
      var next = Object.assign({}, prev);
      next[pos] = prev[pos].slice();
      next[pos][index] = { player_id: null, name: null, team: teamName, pos: null };
      return next;
    });
    setOpenPicker(null);
  }

  function pickPlayerForSlot(pos, index, playerId) {
    var raw = String(playerId != null ? playerId : "").trim();
    if (!raw) {
      setSpelers(function(prev) {
        var cur = prev[pos] && prev[pos][index];
        var team = cur && cur.team ? String(cur.team).trim() : "";
        var next = Object.assign({}, prev);
        next[pos] = prev[pos].slice();
        next[pos][index] = team ? { player_id: null, name: null, team: team, pos: null } : null;
        return next;
      });
      return;
    }
    var pid = Math.floor(Number(raw));
    var meta = rosterById.get(pid);
    setSpelers(function(prev) {
      var next = Object.assign({}, prev);
      next[pos] = prev[pos].slice();
      next[pos][index] = meta
        ? {
            player_id: meta.player_id,
            name: meta.name,
            team: meta.team,
            pos: meta.pos,
          }
        : null;
      return next;
    });
  }

  function pickCoachPlayer(playerId) {
    var pid = Math.floor(Number(playerId));
    var meta = rosterById.get(pid);
    setSpelers(function(prev) {
      var next = Object.assign({}, prev);
      next.coach = [
        meta
          ? {
              player_id: meta.player_id,
              name: meta.name,
              team: meta.team,
              pos: "Coach",
            }
          : null,
      ];
      return next;
    });
  }

  function removePick(pos, index) {
    if (captain && captain.pos === pos && captain.index === index) setCaptain(null);
    setSpelers(function(prev) {
      var next = Object.assign({}, prev);
      next[pos] = prev[pos].slice();
      next[pos][index] = null;
      return next;
    });
  }

  function removeCoach() {
    setSpelers(function(prev) {
      var next = Object.assign({}, prev);
      next.coach = [null];
      return next;
    });
  }

  async function handleSubmit() {
    setError("");
    var fieldFlat = [].concat(spelers.keeper, spelers.def, spelers.mid, spelers.att);
    if (fieldFlat.some(function(x) {
      return !x || !slotHasRealPlayer(x);
    })) {
      return setError(t.pickPlayers);
    }
    var coach = spelers.coach && spelers.coach[0];
    if (!coach || !slotHasRealPlayer(coach)) {
      return setError(t.fillCoachName || "Choose a coach from the squad list");
    }

    var dupCompId = resolveCompetitionId();
    if (dupCompId == null) return setError("Kies een competitie (stap 1).");

    if (!registeringForInvite) {
      var syncRow = publicComps.find(function(c) {
        return Number(c.id) === Number(dupCompId);
      });
      var inRegisterable = publicComps.some(function(c) {
        return Number(c.id) === Number(dupCompId);
      });
      if (!inRegisterable) {
        return setError(t.registerOnlyNonOwnedPools || "Kies een pool waarvoor je lid bent (geen eigen pool).");
      }
      var sel = readSelectedCompetition();
      writeSelectedCompetition({
        id: dupCompId,
        name: syncRow && syncRow.name ? String(syncRow.name) : sel && sel.name ? String(sel.name) : "Pool",
        slug: syncRow && typeof syncRow.slug === "string" ? syncRow.slug : sel && sel.slug ? sel.slug : undefined,
        registration_deadline:
          syncRow && typeof syncRow.registration_deadline === "string"
            ? syncRow.registration_deadline
            : sel && sel.registration_deadline
              ? sel.registration_deadline
              : undefined,
        registration_open:
          typeof syncRow !== "undefined" && syncRow != null && typeof syncRow.registration_open === "boolean"
            ? syncRow.registration_open
            : sel && typeof sel.registration_open === "boolean"
              ? sel.registration_open
              : undefined,
      });
    }

    var playersPayload = [];
    var order = ["keeper", "def", "mid", "att"];
    for (var oi = 0; oi < order.length; oi++) {
      var p = order[oi];
      var arr = spelers[p] || [];
      for (var ii = 0; ii < arr.length; ii++) {
        var slot = arr[ii];
        if (!slot || !slotHasRealPlayer(slot)) continue;
        var isCap = Boolean(captain && captain.pos === p && captain.index === ii);
        playersPayload.push({
          player_id: slot.player_id,
          pos: slot.pos != null ? String(slot.pos) : null,
          is_captain: isCap,
          points: 0,
        });
      }
    }
    playersPayload.push({
      player_id: coach.player_id,
      pos: "Coach",
      is_captain: false,
      points: 0,
    });

    setSubmitting(true);
    try {
      var teamId = existingTeamId;
      if (teamId != null) {
        await dbBijwerkenVeld(String(teamId), {
          naam: form.naam.trim(),
          teamnaam: form.teamnaam.trim(),
          systeem: form.systeem,
        });
        await patchParticipantPlayerRollups(teamId, playersPayload);
      } else {
        var crowForName = publicComps.find(function(c) {
          return Number(c.id) === Number(dupCompId);
        });
        var compName =
          registeringForInvite && inviteRegistration
            ? inviteRegistration.name || "Pool"
            : crowForName && crowForName.name
              ? String(crowForName.name)
              : "Pool";
        var toevoegenPayload = {
          naam: form.naam.trim(),
          teamnaam: form.teamnaam.trim(),
          email: form.email.trim(),
          systeem: form.systeem,
          spelers: [],
          competition_id: dupCompId,
          competition_name: compName,
        };
        if (registeringForInvite) {
          toevoegenPayload.competition_id = inviteRegistration.competitionId;
          toevoegenPayload.competition_name = inviteRegistration.name || "Pool";
        }
        var poolStartsIso = null;
        if (
          registeringForInvite &&
          inviteRegistration &&
          typeof inviteRegistration.registration_deadline === "string" &&
          inviteRegistration.registration_deadline.trim()
        ) {
          poolStartsIso = inviteRegistration.registration_deadline.trim();
        } else if (
          crowForName &&
          typeof crowForName.registration_deadline === "string" &&
          crowForName.registration_deadline.trim()
        ) {
          poolStartsIso = crowForName.registration_deadline.trim();
        } else {
          var selForDeadline = readSelectedCompetition();
          if (
            selForDeadline &&
            typeof selForDeadline.registration_deadline === "string" &&
            selForDeadline.registration_deadline.trim()
          ) {
            poolStartsIso = selForDeadline.registration_deadline.trim();
          } else if (config.deadline) {
            poolStartsIso = config.deadline.toISOString();
          }
        }
        if (poolStartsIso) toevoegenPayload.pool_registration_starts_at = poolStartsIso;
        var created = await dbToevoegen(toevoegenPayload);
        var newId = created && created.id != null ? Math.floor(Number(created.id)) : NaN;
        if (!Number.isFinite(newId) || newId <= 0) throw new Error("Geen team-id van server");
        await patchParticipantPlayerRollups(newId, playersPayload);
      }
      setSuccess(true);
      if (registeringForInvite && typeof clearInviteRegistration === "function") {
        clearInviteRegistration();
      }
      await reloadParticipants();
    } catch (e) {
      console.error(e);
      var errMsg = e && e.message ? String(e.message) : "";
      if (errMsg.indexOf("(409)") !== -1 || /already registered for this competition/i.test(errMsg)) {
        setError(
          t.duplicateRegistration || t.duplicateEmail || "This email already has a team in this competition.",
        );
      } else {
        setError("Fout bij inschrijven: " + (errMsg || "onbekend"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      {registeringForInvite ? (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--bg-3)",
            border: "1px solid var(--orange)",
            fontSize: 14,
          }}
        >
          {(t.registerInviteBanner || "You are joining pool:") + " "}
          <strong>{inviteRegistration.name || "—"}</strong>
        </div>
      ) : null}
      {registeringForInvite ? (
        <div className="step-indicator">
          <div className={"step-dot " + (step >= 1 ? "active" : "")}>1</div>
          <div className={"step-line " + (step >= 2 ? "active" : "")}></div>
          <div className={"step-dot " + (step >= 2 ? "active" : "")}>2</div>
        </div>
      ) : (
        <div className="step-indicator">
          <div className={"step-dot " + (step >= 0 ? "active" : "")}>1</div>
          <div className={"step-line " + (step >= 1 ? "active" : "")}></div>
          <div className={"step-dot " + (step >= 1 ? "active" : "")}>2</div>
          <div className={"step-line " + (step >= 2 ? "active" : "")}></div>
          <div className={"step-dot " + (step >= 2 ? "active" : "")}>3</div>
        </div>
      )}
      <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 14 }}>
        {t.deadlineBefore} <strong style={{ color: "var(--orange)" }}>{config.deadlineLabel}</strong>
      </div>

      {!registeringForInvite && step === 0 && (
        <React.Fragment>
          <div className="card-title">{t.competitionTab?.title || "Competition"}</div>
          {compsLoading ? (
            <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 14 }}>Laden…</div>
          ) : !signedIn ? (
            <React.Fragment>
              <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 16, lineHeight: 1.6 }}>
                {t.registerSignInHint || t.competitionTab?.signInHint}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn" onClick={function() { setTab("competition"); }}>
                  {t.registerCreatePoolCta || t.competitionTab?.createPool || "Create competition"}
                </button>
                <button type="button" className="btn btn-outline" onClick={function() { setTab("competitions"); }}>
                  {t.registerJoinPoolCta || "Participate"}
                </button>
              </div>
            </React.Fragment>
          ) : publicComps.length === 0 ? (
            <React.Fragment>
              <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "var(--fg)" }}>
                {t.registerNoPoolsTitle || "You're not in any pool yet"}
              </p>
              <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 12, lineHeight: 1.6 }}>
                {t.registerNoPoolsBody || "Create a pool or join a public competition first."}
              </p>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#DC2626",
                  marginBottom: 16,
                  lineHeight: 1.55,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(220, 38, 38, 0.45)",
                  background: "rgba(220, 38, 38, 0.08)",
                }}
              >
                {t.registerNoPoolsOwnPoolWarning ||
                  "You cannot register a team in a competition you created yourself—only people who join via your email invitation can register a team there."}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn" onClick={function() { setTab("competition"); }}>
                  {t.registerCreatePoolCta || t.competitionTab?.createPool || "Create competition"}
                </button>
                <button type="button" className="btn btn-outline" onClick={function() { setTab("competitions"); }}>
                  {t.registerJoinPoolCta || "Participate"}
                </button>
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 14, lineHeight: 1.6 }}>
                {t.registerStep1Intro ||
                  "Choose the pool for your team. Only pools you joined (for example after an invitation)—not pools you created yourself."}
              </p>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t.competitionTab?.title || "Competition"}
              </label>
              <select
                value={compSelectId}
                onChange={function(e) {
                  setCompSelectId(e.target.value);
                }}
                style={{ width: "100%", maxWidth: 420, marginBottom: 16 }}
              >
                <option value="">Selecteer…</option>
                {publicComps.map(function(c) {
                  var label = (c.name || c.slug || "Pool") + (c.season_label ? " · " + c.season_label : "");
                  return (
                    <option key={String(c.id)} value={String(c.id)}>
                      {label}
                    </option>
                  );
                })}
              </select>
              {error && <div className="error">{error}</div>}
              <button className="btn" onClick={handleNext} disabled={compsLoading || handleNextBusy}>
                {handleNextBusy ? "…" : t.next + " →"}
              </button>
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      {step === 1 && (
        <React.Fragment>
          <div className="card-title">{t.register1}</div>
          <label>{t.name}</label>
          <input value={form.naam} onChange={function(e) { setForm(Object.assign({}, form, { naam: e.target.value })); }} />
          <label>{t.teamName}</label>
          <input
            value={form.teamnaam}
            onChange={function(e) { setForm(Object.assign({}, form, { teamnaam: e.target.value })); }}
          />
          <label>{t.email}</label>
          <input type="email" value={form.email} onChange={function(e) { setForm(Object.assign({}, form, { email: e.target.value })); }} />
          <label>{t.system}</label>
          <select value={form.systeem} onChange={function(e) { setForm(Object.assign({}, form, { systeem: e.target.value })); }}>
            {Object.keys(FORMATIONS).map(function(k) {
              return (
                <option key={k} value={k}>
                  {k}
                </option>
              );
            })}
          </select>
          {error && <div className="error">{error}</div>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            {!registeringForInvite ? (
              <button type="button" className="btn btn-outline" onClick={function() { setStep(0); }}>
                ← {t.back}
              </button>
            ) : null}
            <button className="btn" onClick={handleNext} disabled={handleNextBusy}>
              {handleNextBusy ? "…" : t.next + " →"}
            </button>
          </div>
        </React.Fragment>
      )}

      {step === 2 && (
        <React.Fragment>
          <div className="card-title">
            {t.register2} — {form.systeem}
          </div>
          {rosterLoading ? (
            <div className="spinner" style={{ marginBottom: 16 }} />
          ) : roster.length === 0 ? (
            <div className="empty-state" style={{ color: "var(--orange)", marginBottom: 16 }}>
              Geen selectiedata voor deze pool. Vraag de organisator om fixture-squads te importeren (Competition →
              fixtures / squads).
            </div>
          ) : (
            <React.Fragment>
              {existingTeamId ? (
                <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 12 }}>
                  Je hebt al een team in deze pool — opslaan werkt je opstelling en gegevens bij.
                </div>
              ) : null}
              <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 14 }}>{t.pickPlayers}</div>

              <div
                style={{
                  background: "linear-gradient(135deg, rgba(255,107,0,0.08), rgba(255,107,0,0.03))",
                  border: "1px solid var(--orange)",
                  borderRadius: 12,
                  padding: "12px 16px",
                  marginBottom: 20,
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flexShrink: 0, marginTop: 2 }}>
                  <CaptainBand size={36} />
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: "var(--wk-heading-font)",
                      fontSize: 15,
                      letterSpacing: "0.05em",
                      color: "var(--orange)",
                      marginBottom: 4,
                    }}
                  >
                    Don&apos;t forget your captain!
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg)" }}>
                    Choose one player as captain by clicking the armband icon next to their name after selecting a
                    player. If their country becomes world champion, you earn <strong>+3 bonus points</strong>.
                  </div>
                </div>
              </div>

              {["keeper", "def", "mid", "att"].map(function(pos) {
                var posLabel = t.pos[pos];
                var arr = spelers[pos] || [];
                var filled = arr.filter(function(x) {
                  return slotHasRealPlayer(x);
                }).length;
                return (
                  <div key={pos} style={{ marginBottom: 22 }}>
                    <div
                      style={{
                        fontFamily: "var(--wk-heading-font)",
                        fontSize: 18,
                        color: "var(--orange)",
                        marginBottom: 10,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {posLabel}
                      <span
                        style={{
                          color: "var(--fg-muted)",
                          fontSize: 13,
                          marginLeft: 8,
                          fontFamily: "Inter,sans-serif",
                          letterSpacing: 0,
                        }}
                      >
                        ({filled} / {arr.length})
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                      {arr.map(function(x, i) {
                        var isCaptain = captain && captain.pos === pos && captain.index === i;
                        if (!x || !x.team) {
                          return (
                            <div
                              key={i}
                              style={{
                                background: "var(--bg-3)",
                                border: "1.5px dashed var(--border)",
                                borderRadius: 10,
                                padding: "10px 12px",
                                opacity: 0.85,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "var(--fg-muted)",
                                  letterSpacing: "0.08em",
                                  textTransform: "uppercase",
                                  marginBottom: 8,
                                }}
                              >
                                Stap 1
                              </div>
                              <button
                                type="button"
                                className="country-btn"
                                style={{ width: "100%", margin: 0, padding: "10px 12px" }}
                                onClick={function() { setOpenPicker({ pos: pos, index: i }); }}
                              >
                                🌍 {t.selectCountry}
                              </button>
                              <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 8, opacity: 0.6 }}>
                                Stap 2: speler selecteren
                              </div>
                            </div>
                          );
                        }
                        var playerChosen = slotHasRealPlayer(x);
                        var opts = playersForTeamAtSlot(x.team, pos);
                        return (
                          <div
                            key={i}
                            style={{
                              background: "var(--bg-3)",
                              border: "1.5px solid " + (isCaptain ? "#FFD700" : "var(--orange)"),
                              borderRadius: 10,
                              padding: "10px 12px",
                              position: "relative",
                            }}
                          >
                            {isCaptain ? (
                              <div
                                style={{
                                  position: "absolute",
                                  top: -12,
                                  left: 10,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  background: "#1a1a1a",
                                  padding: "2px 8px 2px 4px",
                                  borderRadius: 10,
                                  zIndex: 3,
                                }}
                              >
                                <CaptainBand size={20} />
                                <span style={{ fontSize: 9, fontWeight: 800, color: "#FFD700", letterSpacing: "0.08em" }}>
                                  AANVOERDER
                                </span>
                              </div>
                            ) : null}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 6,
                                gap: 4,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    fontSize: 13,
                                    color: "var(--orange)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {flag(x.team)} {x.team}
                                </span>
                              </div>
                              <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
                                {playerChosen ? (
                                  <button
                                    type="button"
                                    title={isCaptain ? "Aanvoerder verwijderen" : "Maak aanvoerder"}
                                    onClick={function() { setCaptain(isCaptain ? null : { pos: pos, index: i }); }}
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      cursor: "pointer",
                                      padding: "2px 2px",
                                      lineHeight: 1,
                                      opacity: isCaptain ? 1 : 0.45,
                                      transition: "opacity .2s",
                                    }}
                                  >
                                    <CaptainBand size={24} active={isCaptain} />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={function() {
                                    if (isCaptain) setCaptain(null);
                                    removePick(pos, i);
                                  }}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "var(--fg-muted)",
                                    fontSize: 14,
                                    padding: "2px 4px",
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: playerChosen ? "#10B981" : "var(--orange)",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                marginBottom: 4,
                              }}
                            >
                              {playerChosen ? "✓ Speler gekozen" : "Stap 2 — Kies speler"}
                            </div>
                            {opts.length ? (
                              <select
                                value={String(playerChosen ? x.player_id : "")}
                                onChange={function(e) { pickPlayerForSlot(pos, i, e.target.value); }}
                                style={{
                                  margin: 0,
                                  fontSize: 13,
                                  padding: "6px 8px",
                                  width: "100%",
                                  borderColor: playerChosen ? "#10B981" : "var(--orange)",
                                }}
                              >
                                <option value="">— {t.choosePlayer || "Kies speler"} —</option>
                                {opts.map(function(p) {
                                  return (
                                    <option key={String(p.player_id)} value={String(p.player_id)}>
                                      {(p.name || "—") + " (" + p.player_id + ")"}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <div style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5 }}>
                                Geen spelers voor dit land en positie in de squad-data. Controleer of squads geïmporteerd
                                zijn.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div style={{ marginBottom: 22 }}>
                <div
                  style={{
                    fontFamily: "var(--wk-heading-font)",
                    fontSize: 18,
                    color: "var(--orange)",
                    marginBottom: 10,
                    letterSpacing: "0.05em",
                  }}
                >
                  {t.pos.coach}
                  <span
                    style={{
                      color: "var(--fg-muted)",
                      fontSize: 13,
                      marginLeft: 8,
                      fontFamily: "Inter,sans-serif",
                      letterSpacing: 0,
                    }}
                  >
                    (
                    {spelers.coach && spelers.coach[0] && slotHasRealPlayer(spelers.coach[0]) ? "1" : "0"} / 1)
                  </span>
                </div>
                {coachOptions.length ? (
                  <select
                    value={spelers.coach[0] && spelers.coach[0].player_id ? String(spelers.coach[0].player_id) : ""}
                    onChange={function(e) {
                      var v = e.target.value;
                      if (!v) removeCoach();
                      else pickCoachPlayer(v);
                    }}
                    style={{ margin: 0, maxWidth: 420, width: "100%" }}
                  >
                    <option value="">— {t.chooseCoach} —</option>
                    {coachOptions.map(function(p) {
                      var taken =
                        selfTaken.has(String(p.team || "").trim()) &&
                        (!spelers.coach[0] || spelers.coach[0].player_id !== p.player_id);
                      return (
                        <option key={String(p.player_id)} value={String(p.player_id)} disabled={taken}>
                          {(p.name || "—") + " — " + (p.team || "") + (taken ? " (land al gebruikt)" : "")}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--orange)" }}>
                    Geen coach-regels in squad-data. Importeer squads met coach uit API-Football.
                  </div>
                )}
              </div>

              {error && <div className="error">{error}</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-outline" onClick={function() { setStep(1); }}>
                  ← {t.back}
                </button>
                <button className="btn" onClick={handleSubmit} disabled={submitting || rosterLoading || roster.length === 0}>
                  {submitting ? "…" : existingTeamId ? t.save || "Opslaan" : t.submit}
                </button>
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      {openPicker && distinctTeamNames.length > 0 ? (
        <CountryPicker
          items={distinctTeamNames}
          taken={teamPickerTaken}
          onPick={function(ct) {
            pickTeamForSlot(openPicker.pos, openPicker.index, ct);
          }}
          onClose={function() {
            setOpenPicker(null);
          }}
        />
      ) : null}
    </div>
  );
}
