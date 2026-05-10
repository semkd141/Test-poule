"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  listPublicCompetitions,
  readSelectedCompetition,
  writeSelectedCompetition,
} from "../../../lib/wk/api-client";
import { toastError } from "../../../lib/wk/toast";
import { getSupabaseAuthRedirectOrigin } from "@/lib/wk/config";
import { getSupabaseBrowser } from "../../../lib/wk/supabase-browser";
import { flag } from "../../../lib/wk/tournament";
import { CaptainBand } from "./teams/captain-band.jsx";

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

export function EditMyTeamTab() {
  const { t, participants, config, reloadParticipants, wkSpelers } = useApp();

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [publicComps, setPublicComps] = useState([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(false);
  const [competitionSelectId, setCompetitionSelectId] = useState("");

  const deadlinePassed = Date.now() > config.deadline.getTime();

  const spelersByLandPos = useMemo(function() {
    const m = {};
    (wkSpelers || []).forEach(function(s) {
      const k = s.land + "|" + s.positie;
      if (!m[k]) m[k] = [];
      m[k].push(s);
    });
    return m;
  }, [wkSpelers]);

  const alleCoaches = useMemo(function() {
    return (wkSpelers || []).filter(function(s){ return s.positie === "coach"; })
      .sort(function(a,b){ return a.land.localeCompare(b.land); });
  }, [wkSpelers]);

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
    const stored = typeof window !== "undefined" ? readSelectedCompetition() : null;
    if (!stored || !stored.id) {
      setMyTeam(null);
      setAuthState("pick_competition");
      return;
    }
    const team = await getMyDeelnemer(email, stored.id);
    if (!team) {
      setMyTeam(null);
      setAuthState("no_team");
    } else {
      setMyTeam(team);
      setEditNaam(team.naam || "");
      setEditTeamnaam(team.teamnaam || "");
      setEditSpelers(Array.isArray(team.spelers) ? team.spelers.slice() : []);
      setAuthState("authenticated");
    }
  }

  async function ensurePublicCompetitionsLoaded() {
    if (publicComps.length > 0 || competitionsLoading) return;
    setCompetitionsLoading(true);
    try {
      const rows = await listPublicCompetitions();
      setPublicComps(Array.isArray(rows) ? rows : []);
    } finally {
      setCompetitionsLoading(false);
    }
  }

  useEffect(function() {
    if (authState !== "pick_competition" && authState !== "authenticated") return undefined;
    var cancelled = false;
    ensurePublicCompetitionsLoaded().then(function() {
      if (cancelled) return;
      if (authState === "pick_competition") {
        var s = readSelectedCompetition();
        if (s && s.id) setCompetitionSelectId(String(s.id));
      }
    });
    return function() { cancelled = true; };
  }, [authState]);

  async function confirmPickCompetition() {
    var id = parseInt(competitionSelectId, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    var row = publicComps.find(function(c) { return Number(c.id) === id; });
    var name = row && row.name ? String(row.name) : "Competition";
    writeSelectedCompetition({ id: id, name: name, slug: row && row.slug ? String(row.slug) : undefined });
    if (!session || !session.user || !session.user.email) return;
    var team = await getMyDeelnemer(session.user.email, id);
    if (!team) {
      setMyTeam(null);
      setAuthState("no_team");
    } else {
      setMyTeam(team);
      setEditNaam(team.naam || "");
      setEditTeamnaam(team.teamnaam || "");
      setEditSpelers(Array.isArray(team.spelers) ? team.spelers.slice() : []);
      setAuthState("authenticated");
    }
  }

  async function switchCompetition(compId) {
    var id = Number(compId);
    if (!Number.isFinite(id) || id <= 0) return;
    await ensurePublicCompetitionsLoaded();
    var row = publicComps.find(function(c) { return Number(c.id) === id; });
    var name = row && row.name ? String(row.name) : "Competition";
    writeSelectedCompetition({ id: id, name: name, slug: row && row.slug ? String(row.slug) : undefined });
    if (!session || !session.user || !session.user.email) return;
    var team = await getMyDeelnemer(session.user.email, id);
    if (!team) {
      setMyTeam(null);
      setAuthState("no_team");
    } else {
      setMyTeam(team);
      setEditNaam(team.naam || "");
      setEditTeamnaam(team.teamnaam || "");
      setEditSpelers(Array.isArray(team.spelers) ? team.spelers.slice() : []);
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
    setSession(null);
    setMyTeam(null);
    setAuthState("unauthenticated");
    setEmailInput("");
  }

  function updateSpelerNaam(index, naam) {
    setEditSpelers(function(prev) {
      const next = prev.slice();
      next[index] = Object.assign({}, next[index], { spelerNaam: naam });
      return next;
    });
  }

  async function saveChanges() {
    setSaving(true);
    try {
      await dbBijwerkenVeld(myTeam.id, {
        naam: editNaam.trim(),
        teamnaam: editTeamnaam.trim(),
        spelers: JSON.stringify(editSpelers)
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

  if (deadlinePassed && authState !== "authenticated") {
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
            Choose a competition
          </div>
          <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:14,lineHeight:1.6}}>
            Select which pool you want to view or edit. This choice is remembered for this browser session.
          </p>
          {competitionsLoading ? (
            <div style={{fontSize:13,color:"var(--fg-muted)"}}>Loading competitions…</div>
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

      {deadlinePassed && (
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
            <input type="text" value={editNaam} onChange={function(e){ setEditNaam(e.target.value); }} style={{margin:0}} disabled={deadlinePassed}/>
          </div>
          <div>
            <label style={{fontSize:11}}>Team name</label>
            <input type="text" value={editTeamnaam} onChange={function(e){ setEditTeamnaam(e.target.value); }} style={{margin:0}} disabled={deadlinePassed}/>
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="card" style={{marginBottom:14}}>
        <div style={{fontFamily:"var(--wk-heading-font)",fontSize:15,marginBottom:12,letterSpacing:"0.05em",color:"var(--orange)"}}>Players & Coach</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {editSpelers.map(function(sp, i) {
            if (!sp || !sp.land) return null;
            const key = sp.land + "|" + sp.positie;
            const options = spelersByLandPos[key] || [];
            const isCoach = sp.positie === "coach";
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--bg-3)",borderRadius:8,flexWrap:"wrap"}}>
                <div style={{width:80,flexShrink:0}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"var(--orange)",letterSpacing:"0.05em"}}>{t.pos[sp.positie] || sp.positie}</div>
                  <div style={{fontSize:12,color:"var(--fg-muted)"}}>{flag(sp.land)} {sp.land}</div>
                </div>
                {!deadlinePassed ? (
                  isCoach ? (
                    <select
                      value={sp.land || ""}
                      onChange={function(e){
                        const coachInfo = alleCoaches.find(function(c){ return c.land === e.target.value; });
                        setEditSpelers(function(prev){
                          const next = prev.slice();
                          next[i] = Object.assign({}, next[i], { land: e.target.value, spelerNaam: coachInfo ? coachInfo.naam : "" });
                          return next;
                        });
                      }}
                      style={{flex:1,margin:0,fontSize:13}}
                    >
                      {alleCoaches.map(function(c){ return <option key={c.id} value={c.land}>{c.naam} — {c.land}</option>; })}
                    </select>
                  ) : options.length > 0 ? (
                    <select
                      value={sp.spelerNaam || ""}
                      onChange={function(e){ updateSpelerNaam(i, e.target.value); }}
                      style={{flex:1,margin:0,fontSize:13}}
                    >
                      <option value="">— Choose player —</option>
                      {options.map(function(o){ return <option key={o.id} value={o.naam}>{o.naam}</option>; })}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={sp.spelerNaam || ""}
                      onChange={function(e){ updateSpelerNaam(i, e.target.value); }}
                      placeholder="Player name"
                      style={{flex:1,margin:0,fontSize:13}}
                    />
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

      {!deadlinePassed && (
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn" onClick={saveChanges} disabled={saving} style={{minWidth:140}}>
            {saving ? "Saving…" : saved ? "✓ Saved!" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

