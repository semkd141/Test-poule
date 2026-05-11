"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { usePersisted } from "../../../hooks/use-persisted";
import {
  authGetValidSession,
  dbLees,
  dbLeesSpelers,
  inviteAccept,
  WK_AUTH_SESSION_EVENT,
} from "../../../lib/wk/api-client";
import { getSupabaseBrowser } from "../../../lib/wk/supabase-browser";
import { getSuperadminUid } from "../../../lib/wk/config";
import { parseConfig } from "../../../lib/wk/parse-config";
import { LANGUAGES } from "../../../lib/wk/locale";
import { T } from "../../../lib/wk/strings";
import { AppCtx } from "../poule-context.jsx";
import { Toaster } from "sonner";

import { FloatingDecor } from "./floating-decor.jsx";
import { Header } from "./header.jsx";
import { Tabs } from "./tabs.jsx";
import { RankingTab } from "./ranking-tab.jsx";
import { MatchesTab } from "./matches-tab.jsx";
import { Matches2Tab } from "./matches2-tab.jsx";
import { ResultsTab } from "./results-tab.jsx";
import { TeamsTab } from "./teams/teams-tab.jsx";
import { RegisterTab } from "./register-tab.jsx";
import { EditMyTeamTab } from "./edit-my-team-tab.jsx";
import { RulesTab } from "./rules-tab.jsx";
import { AdminTab } from "./admin/admin-tab.jsx";
import { CompetitionTab } from "./competition-tab.jsx";
import { AllCompetitionsTab } from "./all-competitions-tab.jsx";
import { PoolPointsTab } from "./pool-points-tab.jsx";

function uidFromJwt(token) {
  if (!token || typeof token !== "string") return "";
  try {
    var parts = token.split(".");
    if (parts.length < 2) return "";
    var payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub.trim() : "";
  } catch {
    return "";
  }
}

export function App() {
  const [theme, setTheme] = usePersisted("wk26_theme", "dark");
  const [lang, setLang] = usePersisted("wk26_lang", "en");
  const [tz, setTz] = usePersisted("wk26_tz", "Europe/London");
  /** True only when the signed-in user matches `NEXT_PUBLIC_SUPERADMIN_UID` (same as backend `ADMIN_UID`). */
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  /** Logged-in users who are not superadmin see Points management (same capabilities as Admin → points, scoped to their pools). */
  const [showPoolPointsTab, setShowPoolPointsTab] = useState(false);
  /** After first auth/role sync: avoids redirecting off #poolPoints before we know visibility. */
  const [poolPointsVisibilityReady, setPoolPointsVisibilityReady] = useState(false);

  // Tab state: driven by URL hash so sharing a link works
  // Default for new visitors: 'register'
  function computeTabFromLocation() {
    if (typeof window === "undefined") return "register";
    var raw = window.location.hash.replace(/^#/, "").trim();
    if (raw.includes("access_token=") || raw.includes("refresh_token=")) return "edit";
    var qp = new URLSearchParams(window.location.search);
    if (qp.has("code")) return "edit";
    var norm = raw === "/edit" || raw === "edit" ? "edit" : raw;
    var valid = ["ranking","matches","matches2","results","teams","competitions","register","edit","rules","competition","poolPoints","admin"];
    if (norm && valid.indexOf(norm) !== -1) return norm;
    return "register";
  }
  const [tab, setTabRaw] = useState(function() {
    if (typeof window === "undefined") return "register";
    return computeTabFromLocation();
  });

  function setTab(t) {
    window.location.hash = t;
    setTabRaw(t);
  }

  // Sync tab on hash / history (auth callbacks use ?code= or #access_token=…)
  useEffect(function() {
    function sync() {
      setTabRaw(computeTabFromLocation());
    }
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return function() {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const [allRows, setAllRows] = useState([]);
  const [wkSpelers, setWkSpelers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteRegistration, setInviteRegistration] = useState(null);

  useEffect(function initInviteFromStorage() {
    if (typeof window === "undefined") return;
    try {
      var cid = sessionStorage.getItem("wk_invite_competition_id");
      if (cid) {
        setInviteRegistration({
          competitionId: Number(cid),
          name: sessionStorage.getItem("wk_invite_competition_name") || "",
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(function captureInviteQueryParam() {
    if (typeof window === "undefined") return;
    try {
      var q = new URLSearchParams(window.location.search);
      var tok = q.get("invite");
      if (tok) {
        sessionStorage.setItem("wk_pending_invite_token", tok);
        var u = new URL(window.location.href);
        u.searchParams.delete("invite");
        window.history.replaceState({}, "", u.pathname + u.search + window.location.hash);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(
    function tryAcceptPendingInvite() {
      if (typeof window === "undefined") return;
      var pending = sessionStorage.getItem("wk_pending_invite_token");
      if (!pending) return;
      var timer = window.setTimeout(function() {
        authGetValidSession()
          .then(function(s) {
            if (!s || !s.access_token) return null;
            return inviteAccept(pending);
          })
          .then(function(r) {
            if (!r || !r.competitionId) return;
            sessionStorage.removeItem("wk_pending_invite_token");
            sessionStorage.setItem("wk_invite_competition_id", String(r.competitionId));
            sessionStorage.setItem("wk_invite_competition_name", r.competitionName || "");
            setInviteRegistration({
              competitionId: r.competitionId,
              name: r.competitionName || "",
            });
          })
          .catch(function(err) {
            console.warn("invite accept", err);
          });
      }, 500);
      return function() {
        clearTimeout(timer);
      };
    },
    [tab, loading],
  );

  function clearInviteRegistration() {
    try {
      sessionStorage.removeItem("wk_invite_competition_id");
      sessionStorage.removeItem("wk_invite_competition_name");
    } catch {
      /* ignore */
    }
    setInviteRegistration(null);
  }

  // Separate config row from real participants
  const config = useMemo(function() { return parseConfig(allRows); }, [allRows]);
  const participants = useMemo(function() {
    return allRows.filter(function(p){ return p.email !== "__config__"; });
  }, [allRows]);

  const currentLang = LANGUAGES.find(function(l) { return l.code === lang; }) || LANGUAGES[0];
  const t = T[lang] || T.nl;

  useEffect(function() {
    document.body.setAttribute("data-theme", theme);
    document.body.setAttribute("dir", currentLang.dir);
    document.documentElement.setAttribute("lang", lang);
  }, [theme, lang, currentLang.dir]);

  const loadParticipants = useCallback(async function() {
    setLoading(true);
    const data = await dbLees();
    setAllRows(data);
    setLoading(false);
  }, []);

  // Load wk_spelers once on mount
  useEffect(function() {
    dbLeesSpelers().then(setWkSpelers);
  }, []);

  useEffect(function() { loadParticipants(); }, [loadParticipants]);

  /** Superadmin vs pool Points tab: run in one sequence so we never flash Points for superadmin. */
  useEffect(function() {
    var mounted = true;
    var adminUid = getSuperadminUid();
    /** Latest-wins: overlapping auth/sync runs must not apply stale `showPoolPointsTab` (avoids tab unmount blink). */
    var syncGen = 0;

    async function resolveViewerUid() {
      var uid = "";
      try {
        var wk0 = await authGetValidSession();
        var u0 = wk0 && wk0.user;
        var wu0 = u0 && typeof u0 === "object" && typeof u0.id === "string" ? u0.id : "";
        if (wu0) uid = wu0.trim();
        if (!uid && wk0 && typeof wk0.access_token === "string") {
          uid = uidFromJwt(wk0.access_token);
        }
      } catch {
        /* ignore */
      }
      if (!uid) {
        try {
          var sb = getSupabaseBrowser();
          if (sb) {
            var gr = await sb.auth.getSession();
            var su = gr.data.session && gr.data.session.user && gr.data.session.user.id;
            if (typeof su === "string") uid = su.trim();
            if (!uid) {
              var sat = gr.data.session && gr.data.session.access_token;
              uid = uidFromJwt(typeof sat === "string" ? sat : "");
            }
          }
        } catch {
          /* ignore */
        }
      }
      return uid;
    }

    /** Points tab in the nav for any signed-in participant (not superadmin); PoolPointsTab handles empty pools. */
    async function updatePoolPointsVisibility(runId) {
      try {
        var s = await authGetValidSession();
        if (!mounted || runId !== syncGen) return;
        setShowPoolPointsTab(Boolean(s && s.access_token));
      } catch {
        if (!mounted || runId !== syncGen) return;
        setShowPoolPointsTab(false);
      }
    }

    async function syncRoleAndPoolTab() {
      var runId = ++syncGen;
      try {
        if (!adminUid) {
          if (mounted && runId === syncGen) setIsSuperadmin(false);
          await updatePoolPointsVisibility(runId);
          return;
        }
        var uid = await resolveViewerUid();
        if (!mounted || runId !== syncGen) return;
        var superuser = Boolean(uid && uid === adminUid);
        setIsSuperadmin(superuser);
        if (superuser) {
          setShowPoolPointsTab(false);
          return;
        }
        await updatePoolPointsVisibility(runId);
      } finally {
        if (mounted && runId === syncGen) setPoolPointsVisibilityReady(true);
      }
    }

    syncRoleAndPoolTab();

    function onWkAuthStorage() {
      syncRoleAndPoolTab();
    }
    if (typeof window !== "undefined") {
      window.addEventListener(WK_AUTH_SESSION_EVENT, onWkAuthStorage);
    }

    var sb = getSupabaseBrowser();
    var sub = null;
    if (sb) {
      sub = sb.auth.onAuthStateChange(function() {
        syncRoleAndPoolTab();
      });
    }
    return function() {
      mounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener(WK_AUTH_SESSION_EVENT, onWkAuthStorage);
      }
      if (sub && sub.data && sub.data.subscription) sub.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(function() {
    if (tab === "admin" && !isSuperadmin) setTab("ranking");
  }, [tab, isSuperadmin]);

  useEffect(function() {
    if (!poolPointsVisibilityReady) return;
    if (tab === "poolPoints" && (!showPoolPointsTab || isSuperadmin)) setTab("ranking");
  }, [tab, showPoolPointsTab, isSuperadmin, poolPointsVisibilityReady]);

  const ctx = {
    theme,
    setTheme,
    lang,
    setLang,
    tz,
    setTz,
    currentLang,
    t,
    participants,
    config,
    reloadParticipants: loadParticipants,
    loading,
    /** Only the configured superadmin UID sees the Admin tab. */
    adminMode: isSuperadmin,
    showPoolPointsTab,
    setAdminMode: function() {
      /* no-op: admin access is tied to superadmin UID only */
    },
    setTab,
    wkSpelers,
    inviteRegistration,
    clearInviteRegistration,
  };

  return (
    <AppCtx.Provider value={ctx}>
      <Toaster
        position="top-center"
        theme={theme === "dark" ? "dark" : "light"}
        closeButton
        richColors
      />
      <FloatingDecor />
      <Header />
      <Tabs active={tab} onChange={setTab} />
      <main className="main">
        {tab === "ranking" && <RankingTab />}
        {tab === "matches" && <MatchesTab />}
        {tab === "matches2" && <Matches2Tab />}
        {tab === "results" && <ResultsTab />}
        {tab === "teams" && <TeamsTab />}
        {tab === "competitions" && <AllCompetitionsTab />}
        {tab === "register" && <RegisterTab />}
        {tab === "edit" && <EditMyTeamTab />}
        {tab === "rules" && <RulesTab />}
        {tab === "competition" && <CompetitionTab />}
        {tab === "poolPoints" && !isSuperadmin && showPoolPointsTab && <PoolPointsTab />}
        {tab === "admin" && isSuperadmin && <AdminTab />}
      </main>
    </AppCtx.Provider>
  );
}
