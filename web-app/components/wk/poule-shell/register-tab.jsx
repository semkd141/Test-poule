"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../poule-context.jsx";
import { FORMATIONS, flag } from "../../../lib/wk/tournament";
import {
  authGetValidSession,
  dbToevoegen,
  joinCompetition,
  listMyRegisterableCompetitions,
  persistSupabaseSessionToWkStorage,
  readSelectedCompetition,
  writeSelectedCompetition,
  consumeRegisterSkipCompetitionStep,
} from "../../../lib/wk/api-client";
import { getSupabaseBrowser } from "../../../lib/wk/supabase-browser";
import { CaptainBand } from "./teams/captain-band.jsx";
import { CountryPicker } from "./country-picker.jsx";

export function RegisterTab() {
  const { t, config, reloadParticipants, wkSpelers, inviteRegistration, clearInviteRegistration, setTab } = useApp();
  const [form, setForm] = useState({ naam:"", teamnaam:"", email:"", systeem:"4-3-3" });
  const [spelers, setSpelers] = useState({ keeper:[null], def:[null,null,null,null], mid:[null,null,null], att:[null,null,null], coach:[null] });
  const [captain, setCaptain] = useState(null); // { pos, index } — which slot is captain
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openPicker, setOpenPicker] = useState(null);
  const [openPlayerPicker, setOpenPlayerPicker] = useState(null);

  var registeringForInvite =
    inviteRegistration && typeof inviteRegistration.competitionId === "number";
  const formation = FORMATIONS[form.systeem];

  const [step, setStep] = useState(registeringForInvite ? 1 : 0);
  const [publicComps, setPublicComps] = useState([]);
  const [compsLoading, setCompsLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [compSelectId, setCompSelectId] = useState("");

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

  /** Invite flow skipped the non-invite auth listener; sync Supabase → WK storage so POST /participants sends Bearer. */
  useEffect(
    function() {
      if (!registeringForInvite) return undefined;
      var sb = getSupabaseBrowser();
      if (!sb) return undefined;
      sb.auth.getSession().then(function(gr) {
        var s = gr.data.session;
        if (s && s.access_token && s.user) {
          persistSupabaseSessionToWkStorage({
            access_token: s.access_token,
            refresh_token: s.refresh_token,
            expires_at: s.expires_at,
            expires_in: s.expires_in,
            user: s.user,
          });
        }
      });
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

  /** After sign-in (e.g. user opened Register from All competitions before logging in), record pool membership. */
  useEffect(
    function() {
      if (registeringForInvite) return undefined;
      if (step < 1) return undefined;
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

  /** Drop pre-selected / session pool if it is one you own (not in registerable list). */
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

  // Index wk_spelers by land+positie for fast lookup
  const spelersByLandPos = useMemo(function() {
    const m = {};
    (wkSpelers || []).forEach(function(s) {
      const k = s.land + "|" + s.positie;
      if (!m[k]) m[k] = [];
      m[k].push(s);
    });
    return m;
  }, [wkSpelers]);

  // List of all coaches from wk_spelers
  const alleCoaches = useMemo(function() {
    return (wkSpelers || []).filter(function(s) { return s.positie === "coach"; })
      .sort(function(a,b){ return a.land.localeCompare(b.land); });
  }, [wkSpelers]);

  const selfTaken = useMemo(function() {
    const s = new Set();
    Object.values(spelers).forEach(function(arr) {
      arr.forEach(function(x) { if (x && x.land) s.add(x.land); });
    });
    return s;
  }, [spelers]);

  useEffect(function() {
    function resizeArr(arr, len) {
      const a = (arr || []).slice();
      while (a.length < len) a.push(null);
      return a.slice(0, len);
    }
    setSpelers(function(prev) {
      return {
        keeper: resizeArr(prev.keeper, formation.keeper),
        def:    resizeArr(prev.def, formation.def),
        mid:    resizeArr(prev.mid, formation.mid),
        att:    resizeArr(prev.att, formation.att),
        coach:  resizeArr(prev.coach, 1)
      };
    });
  }, [form.systeem, formation.keeper, formation.def, formation.mid, formation.att]);

  useEffect(function() {
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
  }, []);

  if (deadlinePassed) return <div className="card"><div className="empty-state" style={{color:"var(--orange)"}}>{t.deadlinePassed}</div></div>;
  if (success) return <div className="card"><div className="success">{t.successReg}</div></div>;

  function handleNext() {
    setError("");
    if (!registeringForInvite && step === 0) {
      var cid = parseInt(compSelectId, 10);
      if (!Number.isFinite(cid) || cid <= 0) return setError("Kies een competitie.");
      var crow = publicComps.find(function(c) {
        return Number(c.id) === cid;
      });
      writeSelectedCompetition({
        id: cid,
        name: crow && crow.name ? String(crow.name) : "Pool",
        slug: crow && crow.slug ? String(crow.slug) : undefined,
        registration_deadline:
          crow && typeof crow.registration_deadline === "string" ? crow.registration_deadline : undefined,
        registration_open:
          crow && typeof crow.registration_open === "boolean" ? crow.registration_open : undefined,
      });
      setStep(1);
      authGetValidSession().then(function(sess) {
        if (!sess || !sess.access_token) return;
        joinCompetition(cid).catch(function(err) {
          setError(String(err && err.message ? err.message : err));
        });
      });
      return;
    }
    if (!form.naam.trim()) return setError("Vul je naam in");
    if (!form.teamnaam.trim()) return setError("Vul een teamnaam in");
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Geldig e-mailadres vereist");
    setStep(2);
  }

  function pickCountry(pos, index, land) {
    setSpelers(function(prev) {
      const next = Object.assign({}, prev);
      next[pos] = prev[pos].slice();
      next[pos][index] = { land: land, spelerNaam: "", positie: pos, punten: 0 };
      return next;
    });
    setOpenPicker(null);
    // After country picked: if players exist for this land+positie, open player picker
    const key = land + "|" + pos;
    if (spelersByLandPos[key] && spelersByLandPos[key].length > 0) {
      setOpenPlayerPicker({ pos: pos, index: index, land: land });
    }
  }

  function pickPlayer(pos, index, naam) {
    setSpelers(function(prev) {
      const next = Object.assign({}, prev);
      next[pos] = prev[pos].slice();
      if (next[pos][index]) {
        next[pos][index] = Object.assign({}, next[pos][index], { spelerNaam: naam });
      }
      return next;
    });
    setOpenPlayerPicker(null);
  }

  function updatePlayerNameManual(pos, index, naam) {
    setSpelers(function(prev) {
      const next = Object.assign({}, prev);
      next[pos] = prev[pos].slice();
      if (next[pos][index]) {
        next[pos][index] = Object.assign({}, next[pos][index], { spelerNaam: naam });
      }
      return next;
    });
  }

  function pickCoachByLand(land) {
    // Look up coach for that land in wkSpelers
    const coachInfo = alleCoaches.find(function(c){ return c.land === land; });
    setSpelers(function(prev) {
      const next = Object.assign({}, prev);
      next.coach = [{
        land: land,
        spelerNaam: coachInfo ? coachInfo.naam : "",
        positie: "coach",
        punten: 0
      }];
      return next;
    });
  }

  function updateCoachName(name) {
    setSpelers(function(prev) {
      const next = Object.assign({}, prev);
      const cur = (prev.coach && prev.coach[0]) || {};
      next.coach = [Object.assign({}, cur, { positie:"coach", punten:0, spelerNaam: name })];
      return next;
    });
  }

  function removePick(pos, index) {
    setSpelers(function(prev) {
      const next = Object.assign({}, prev);
      next[pos] = prev[pos].slice();
      next[pos][index] = null;
      return next;
    });
  }

  async function handleSubmit() {
    setError("");
    const fieldFlat = [].concat(spelers.keeper, spelers.def, spelers.mid, spelers.att);
    if (fieldFlat.some(function(x) { return !x; })) return setError(t.pickPlayers);
    const coach = spelers.coach && spelers.coach[0];
    const coachOk = coach && ((coach.spelerNaam && coach.spelerNaam.trim()) || (coach.land && coach.land.trim()));
    if (!coachOk) return setError(t.fillCoachName || "Vul de naam van de bondscoach in");

    // Mark captain in flat array
    const flatWithCaptain = fieldFlat.map(function(x, idx) {
      // Captain pos/index is relative to the position group
      // We need to find which flat index corresponds to captain
      if (!captain) return Object.assign({}, x);
      const posGroups = {keeper: spelers.keeper, def: spelers.def, mid: spelers.mid, att: spelers.att};
      const posOrder = ["keeper","def","mid","att"];
      let flatIdx = 0;
      var isCap = false;
      for (var pi = 0; pi < posOrder.length; pi++) {
        var p = posOrder[pi];
        var arr = posGroups[p];
        for (var ii = 0; ii < arr.length; ii++) {
          if (flatIdx === idx && captain.pos === p && captain.index === ii) {
            isCap = true;
          }
          flatIdx++;
        }
      }
      return Object.assign({}, x, isCap ? {aanvoerder: true} : {});
    });

    const flat = flatWithCaptain.concat([{
      land: coach.land || "",
      spelerNaam: (coach.spelerNaam || "").trim(),
      positie: "coach",
      punten: 0
    }]);

    var dupCompId;
    if (registeringForInvite && typeof inviteRegistration.competitionId === "number") {
      dupCompId = inviteRegistration.competitionId;
    } else if (!registeringForInvite) {
      var fromSelect = parseInt(String(compSelectId || "").trim(), 10);
      var sel = readSelectedCompetition();
      var fromSession = sel && typeof sel.id === "number" ? sel.id : parseInt(String(sel && sel.id), 10);
      dupCompId = Number.isFinite(fromSelect) && fromSelect > 0 ? fromSelect : fromSession;
      if (!Number.isFinite(dupCompId) || dupCompId <= 0) {
        return setError("Kies een competitie (stap 1).");
      }
      var syncRow = publicComps.find(function(c) {
        return Number(c.id) === Number(dupCompId);
      });
      var inRegisterable = publicComps.some(function(c) {
        return Number(c.id) === Number(dupCompId);
      });
      if (!inRegisterable) {
        return setError(t.registerOnlyNonOwnedPools || "Kies een pool waarvoor je lid bent (geen eigen pool).");
      }
      writeSelectedCompetition({
        id: dupCompId,
        name: syncRow && syncRow.name ? String(syncRow.name) : sel && sel.name ? String(sel.name) : "Pool",
        slug: syncRow && typeof syncRow.slug === "string" ? syncRow.slug : sel && sel.slug ? sel.slug : undefined,
        registration_deadline:
          syncRow && typeof syncRow.registration_deadline === "string" ? syncRow.registration_deadline : sel?.registration_deadline,
        registration_open:
          typeof syncRow?.registration_open === "boolean" ? syncRow.registration_open : sel?.registration_open,
      });
    }

    setSubmitting(true);
    try {
      var toevoegenPayload = {
        naam: form.naam.trim(),
        teamnaam: form.teamnaam.trim(),
        email: form.email.trim(),
        systeem: form.systeem,
        spelers: flat,
      };
      if (registeringForInvite) {
        toevoegenPayload.competition_id = inviteRegistration.competitionId;
        toevoegenPayload.competition_name = inviteRegistration.name || "Pool";
      } else {
        var crow = publicComps.find(function(c) {
          return Number(c.id) === Number(dupCompId);
        });
        toevoegenPayload.competition_id = dupCompId;
        toevoegenPayload.competition_name = crow && crow.name ? String(crow.name) : "Pool";
      }
      var poolStartsIso = null;
      if (
        registeringForInvite &&
        inviteRegistration &&
        typeof inviteRegistration.registration_deadline === "string" &&
        inviteRegistration.registration_deadline.trim()
      ) {
        poolStartsIso = inviteRegistration.registration_deadline.trim();
      } else if (!registeringForInvite) {
        var crowDeadline = publicComps.find(function(c) {
          return Number(c.id) === Number(dupCompId);
        });
        if (
          crowDeadline &&
          typeof crowDeadline.registration_deadline === "string" &&
          crowDeadline.registration_deadline.trim()
        ) {
          poolStartsIso = crowDeadline.registration_deadline.trim();
        } else {
          var sdead = readSelectedCompetition();
          if (sdead && typeof sdead.registration_deadline === "string" && sdead.registration_deadline.trim()) {
            poolStartsIso = sdead.registration_deadline.trim();
          }
        }
      }
      if (!poolStartsIso && config.deadline) poolStartsIso = config.deadline.toISOString();
      if (poolStartsIso) toevoegenPayload.pool_registration_starts_at = poolStartsIso;
      await dbToevoegen(toevoegenPayload);
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
          t.duplicateRegistration ||
            t.duplicateEmail ||
            "This email already has a team in this competition.",
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
      <div style={{fontSize:13,color:"var(--fg-muted)",marginBottom:14}}>
        {t.deadlineBefore} <strong style={{color:"var(--orange)"}}>{config.deadlineLabel}</strong>
      </div>

      {!registeringForInvite && step === 0 && (
        <React.Fragment>
          <div className="card-title">{t.competitionTab?.title || "Competition"}</div>
          {compsLoading ? (
            <div style={{fontSize:13,color:"var(--fg-muted)",marginBottom:14}}>Laden…</div>
          ) : !signedIn ? (
            <React.Fragment>
              <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:16,lineHeight:1.6}}>
                {t.registerSignInHint || t.competitionTab?.signInHint}
              </p>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <button type="button" className="btn" onClick={function(){ setTab("competition"); }}>
                  {t.registerCreatePoolCta || t.competitionTab?.createPool || "Create competition"}
                </button>
                <button type="button" className="btn btn-outline" onClick={function(){ setTab("competitions"); }}>
                  {t.registerJoinPoolCta || "Participate"}
                </button>
              </div>
            </React.Fragment>
          ) : publicComps.length === 0 ? (
            <React.Fragment>
              <p style={{fontSize:15,fontWeight:700,marginBottom:8,color:"var(--fg)"}}>
                {t.registerNoPoolsTitle || "You're not in any pool yet"}
              </p>
              <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:12,lineHeight:1.6}}>
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
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <button type="button" className="btn" onClick={function(){ setTab("competition"); }}>
                  {t.registerCreatePoolCta || t.competitionTab?.createPool || "Create competition"}
                </button>
                <button type="button" className="btn btn-outline" onClick={function(){ setTab("competitions"); }}>
                  {t.registerJoinPoolCta || "Participate"}
                </button>
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:14,lineHeight:1.6}}>
                {t.registerStep1Intro ||
                  "Choose the pool for your team. Only pools you joined (for example after an invitation)—not pools you created yourself."}
              </p>
              <label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>
                {t.competitionTab?.title || "Competition"}
              </label>
              <select
                value={compSelectId}
                onChange={function(e){ setCompSelectId(e.target.value); }}
                style={{width:"100%",maxWidth:420,marginBottom:16}}
              >
                <option value="">Selecteer…</option>
                {publicComps.map(function(c) {
                  var label = (c.name || c.slug || "Pool") + (c.season_label ? " · " + c.season_label : "");
                  return (
                    <option key={String(c.id)} value={String(c.id)}>{label}</option>
                  );
                })}
              </select>
              {error && <div className="error">{error}</div>}
              <button className="btn" onClick={handleNext} disabled={compsLoading}>
                {t.next} →
              </button>
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      {step === 1 && (
        <React.Fragment>
          <div className="card-title">{t.register1}</div>
          <label>{t.name}</label>
          <input value={form.naam} onChange={function(e){setForm(Object.assign({}, form, {naam:e.target.value}));}} />
          <label>{t.teamName}</label>
          <input value={form.teamnaam} onChange={function(e){setForm(Object.assign({}, form, {teamnaam:e.target.value}));}} />
          <label>{t.email}</label>
          <input type="email" value={form.email} onChange={function(e){setForm(Object.assign({}, form, {email:e.target.value}));}} />
          <label>{t.system}</label>
          <select value={form.systeem} onChange={function(e){setForm(Object.assign({}, form, {systeem:e.target.value}));}}>
            {Object.keys(FORMATIONS).map(function(k) { return <option key={k} value={k}>{k}</option>; })}
          </select>
          {error && <div className="error">{error}</div>}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:8}}>
            {!registeringForInvite ? (
              <button type="button" className="btn btn-outline" onClick={function(){ setStep(0); }}>
                ← {t.back}
              </button>
            ) : null}
            <button className="btn" onClick={handleNext}>{t.next} →</button>
          </div>
        </React.Fragment>
      )}

      {step === 2 && (
        <React.Fragment>
          <div className="card-title">{t.register2} — {form.systeem}</div>
          <div style={{fontSize:13,color:"var(--fg-muted)",marginBottom:14}}>{t.pickPlayers}</div>

          {/* Aanvoerder instructie */}
          <div style={{
            background:"linear-gradient(135deg, rgba(255,107,0,0.08), rgba(255,107,0,0.03))",
            border:"1px solid var(--orange)",
            borderRadius:12,
            padding:"12px 16px",
            marginBottom:20,
            display:"flex",
            gap:14,
            alignItems:"flex-start"
          }}>
            <div style={{flexShrink:0,marginTop:2}}>
              <CaptainBand size={36}/>
            </div>
            <div>
              <div style={{fontFamily:"var(--wk-heading-font)",fontSize:15,letterSpacing:"0.05em",color:"var(--orange)",marginBottom:4}}>
                Don't forget your captain!
              </div>
              <div style={{fontSize:13,lineHeight:1.6,color:"var(--fg)"}}>
                Choose one player as captain by clicking the armband icon next to their name after selecting a player. If their country becomes world champion, you earn <strong>+3 bonus points</strong>.
              </div>
            </div>
          </div>

          {["keeper","def","mid","att"].map(function(pos) {
            const posLabel = t.pos[pos];
            const arr = spelers[pos] || [];
            const filled = arr.filter(function(x){return x && x.land;}).length;
            return (
              <div key={pos} style={{marginBottom:22}}>
                <div style={{fontFamily:"var(--wk-heading-font)",fontSize:18,color:"var(--orange)",marginBottom:10,letterSpacing:"0.05em"}}>
                  {posLabel}
                  <span style={{color:"var(--fg-muted)",fontSize:13,marginLeft:8,fontFamily:"Inter,sans-serif",letterSpacing:0}}>({filled} / {arr.length})</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:10}}>
                  {arr.map(function(x, i) {
                    const isCaptain = captain && captain.pos === pos && captain.index === i;
                    const playerKey = x ? (x.land + "|" + pos) : "";
                    const availablePlayers = x ? (spelersByLandPos[playerKey] || []) : [];
                    const hasPlayerList = availablePlayers.length > 0;
                    const playerChosen = x && x.spelerNaam && x.spelerNaam.trim();

                    if (!x || !x.land) {
                      // STAP 1: Nog geen land gekozen
                      return (
                        <div key={i} style={{background:"var(--bg-3)",border:"1.5px dashed var(--border)",borderRadius:10,padding:"10px 12px",opacity:0.85}}>
                          <div style={{fontSize:11,fontWeight:700,color:"var(--fg-muted)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>
                            Stap 1
                          </div>
                          <button
                            type="button"
                            className="country-btn"
                            style={{width:"100%",margin:0,padding:"10px 12px"}}
                            onClick={function(){ setOpenPicker({ pos: pos, index: i }); }}
                          >
                            🌍 {t.selectCountry}
                          </button>
                          <div style={{fontSize:11,color:"var(--fg-muted)",marginTop:8,opacity:0.6}}>
                            Stap 2: speler selecteren
                          </div>
                        </div>
                      );
                    }

                    // STAP 1 gedaan, STAP 2: speler kiezen
                    return (
                      <div key={i} style={{
                        background:"var(--bg-3)",
                        border:"1.5px solid " + (isCaptain ? "#FFD700" : "var(--orange)"),
                        borderRadius:10,
                        padding:"10px 12px",
                        position:"relative"
                      }}>
                        {/* Aanvoerdersbandje badge */}
                        {isCaptain && (
                          <div style={{position:"absolute",top:-12,left:10,display:"flex",alignItems:"center",gap:4,background:"#1a1a1a",padding:"2px 8px 2px 4px",borderRadius:10,zIndex:3}}>
                            <CaptainBand size={20}/>
                            <span style={{fontSize:9,fontWeight:800,color:"#FFD700",letterSpacing:"0.08em"}}>AANVOERDER</span>
                          </div>
                        )}

                        {/* Land + verwijder */}
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,gap:4}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                            <span style={{fontWeight:700,fontSize:13,color:"var(--orange)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {flag(x.land)} {x.land}
                            </span>
                          </div>
                          <div style={{display:"flex",gap:4,flexShrink:0,alignItems:"center"}}>
                            {/* Aanvoerder knop */}
                            {playerChosen && (
                              <button
                                type="button"
                                title={isCaptain ? "Aanvoerder verwijderen" : "Maak aanvoerder"}
                                onClick={function(){ setCaptain(isCaptain ? null : {pos:pos, index:i}); }}
                                style={{background:"transparent",border:"none",cursor:"pointer",padding:"2px 2px",lineHeight:1,opacity:isCaptain?1:0.45,transition:"opacity .2s"}}
                              >
                                <CaptainBand size={24} active={isCaptain}/>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={function(){
                                if (isCaptain) setCaptain(null);
                                removePick(pos, i);
                              }}
                              style={{background:"transparent",border:"none",cursor:"pointer",color:"var(--fg-muted)",fontSize:14,padding:"2px 4px"}}
                            >✕</button>
                          </div>
                        </div>

                        {/* Stap 2 label */}
                        <div style={{fontSize:10,fontWeight:700,color:playerChosen?"#10B981":"var(--orange)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>
                          {playerChosen ? "✓ Speler gekozen" : "Stap 2 — Kies speler"}
                        </div>

                        {/* Speler selectie */}
                        {hasPlayerList ? (
                          <select
                            value={x.spelerNaam || ""}
                            onChange={function(e){ updatePlayerNameManual(pos, i, e.target.value); }}
                            style={{margin:0,fontSize:13,padding:"6px 8px",borderColor:playerChosen?"#10B981":"var(--orange)"}}
                          >
                            <option value="">— {t.choosePlayer || "Kies speler"} —</option>
                            {availablePlayers.map(function(sp){
                              return <option key={sp.id} value={sp.naam}>{sp.naam}</option>;
                            })}
                          </select>
                        ) : (
                          <input
                            type="text"
                            placeholder={t.playerNameManual || "Naam (handmatig)"}
                            value={x.spelerNaam || ""}
                            onChange={function(e){ updatePlayerNameManual(pos, i, e.target.value); }}
                            style={{margin:0,fontSize:13,padding:"6px 8px",borderColor:playerChosen?"#10B981":"var(--orange)"}}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Coach: pick land first, then choose coach name */}
          <div style={{marginBottom:22}}>
            <div style={{fontFamily:"var(--wk-heading-font)",fontSize:18,color:"var(--orange)",marginBottom:10,letterSpacing:"0.05em"}}>
              {t.pos.coach}
              <span style={{color:"var(--fg-muted)",fontSize:13,marginLeft:8,fontFamily:"Inter,sans-serif",letterSpacing:0}}>
                ({(spelers.coach && spelers.coach[0] && (spelers.coach[0].spelerNaam || spelers.coach[0].land)) ? "1" : "0"} / 1)
              </span>
            </div>
            {alleCoaches.length > 0 ? (
              <select
                value={(spelers.coach && spelers.coach[0] && spelers.coach[0].land) || ""}
                onChange={function(e){ pickCoachByLand(e.target.value); }}
                style={{margin:0}}
              >
                <option value="">— {t.chooseCoach || "Choose coach"} —</option>
                {alleCoaches.map(function(c) {
                  const isTaken = selfTaken.has(c.land);
                  return (
                    <option key={c.id} value={c.land} disabled={isTaken} style={isTaken?{color:"#aaa"}:{}}>
                      {isTaken ? "⛔ " : ""}{c.naam} — {c.land}{isTaken ? " (al gebruikt)" : ""}
                    </option>
                  );
                })}
              </select>
            ) : (
              <input
                type="text"
                placeholder={t.coachNamePlaceholder || "Naam van de bondscoach (bijv. Ronald Koeman)"}
                value={(spelers.coach && spelers.coach[0] && spelers.coach[0].spelerNaam) || ""}
                onChange={function(e){ updateCoachName(e.target.value); }}
                style={{margin:0}}
              />
            )}
          </div>

          {error && <div className="error">{error}</div>}
          <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
            <button className="btn btn-outline" onClick={function(){setStep(1);}}>← {t.back}</button>
            <button className="btn" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "…" : t.submit}
            </button>
          </div>
        </React.Fragment>
      )}

      {openPicker && (
        <CountryPicker
          taken={selfTaken}
          onPick={function(land) { pickCountry(openPicker.pos, openPicker.index, land); }}
          onClose={function() { setOpenPicker(null); }}
        />
      )}
    </div>
  );
}
