"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { usePersisted } from "../../../hooks/use-persisted";
import { authGetValidSession, dbLees, dbLeesSpelers } from "../../../lib/wk/api-client";
import { getSupabaseBrowser } from "../../../lib/wk/supabase-browser";
import { getAdminUid } from "../../../lib/wk/config";
import { parseConfig } from "../../../lib/wk/parse-config";
import { LANGUAGES } from "../../../lib/wk/locale";
import { T } from "../../../lib/wk/strings";
import { AppCtx } from "../poule-context.jsx";

import { FloatingDecor } from "./floating-decor.jsx";
import { Header } from "./header.jsx";
import { Tabs } from "./tabs.jsx";
import { RankingTab } from "./ranking-tab.jsx";
import { MatchesTab } from "./matches-tab.jsx";
import { ResultsTab } from "./results-tab.jsx";
import { TeamsTab } from "./teams/teams-tab.jsx";
import { RegisterTab } from "./register-tab.jsx";
import { EditMyTeamTab } from "./edit-my-team-tab.jsx";
import { RulesTab } from "./rules-tab.jsx";
import { AdminTab } from "./admin/admin-tab.jsx";

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
  const [adminMode, setAdminMode] = usePersisted("wk26_admin", false);
  const [uidAdminMode, setUidAdminMode] = useState(false);

  // Tab state: driven by URL hash so sharing a link works
  // Default for new visitors: 'register'
  function computeTabFromLocation() {
    if (typeof window === "undefined") return "register";
    var raw = window.location.hash.replace(/^#/, "").trim();
    if (raw.includes("access_token=") || raw.includes("refresh_token=")) return "edit";
    var qp = new URLSearchParams(window.location.search);
    if (qp.has("code")) return "edit";
    var norm = raw === "/edit" || raw === "edit" ? "edit" : raw;
    var valid = ["ranking","matches","results","teams","register","edit","rules","admin"];
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

  // Auto-enable admin UI for configured admin UID when logged in.
  useEffect(function() {
    var mounted = true;
    var adminUid = getAdminUid();
    if (!adminUid) {
      setUidAdminMode(false);
      return;
    }

    async function recompute() {
      var uid = "";
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
      if (!uid) {
        try {
          var wk = await authGetValidSession();
          var u = wk && wk.user;
          var wu = u && typeof u === "object" && typeof u.id === "string" ? u.id : "";
          if (wu) uid = wu.trim();
          if (!uid && wk && typeof wk.access_token === "string") {
            uid = uidFromJwt(wk.access_token);
          }
        } catch {
          /* ignore */
        }
      }
      if (mounted) setUidAdminMode(Boolean(uid && uid === adminUid));
    }

    recompute();

    var sb = getSupabaseBrowser();
    var sub = null;
    if (sb) {
      sub = sb.auth.onAuthStateChange(function() {
        recompute();
      });
    }
    return function() {
      mounted = false;
      if (sub && sub.data && sub.data.subscription) sub.data.subscription.unsubscribe();
    };
  }, []);

  const adminUiMode = adminMode || uidAdminMode;

  // If user navigates to admin tab but isn't admin, redirect to ranking
  useEffect(function() {
    if (tab === "admin" && !adminUiMode) setTab("ranking");
  }, [tab, adminUiMode]);

  const ctx = { theme, setTheme, lang, setLang, tz, setTz, currentLang, t, participants, config, reloadParticipants: loadParticipants, loading, adminMode: adminUiMode, setAdminMode, setTab, wkSpelers };

  return (
    <AppCtx.Provider value={ctx}>
      <FloatingDecor />
      <Header />
      <Tabs active={tab} onChange={setTab} />
      <main className="main">
        {tab === "ranking" && <RankingTab />}
        {tab === "matches" && <MatchesTab />}
        {tab === "results" && <ResultsTab />}
        {tab === "teams" && <TeamsTab />}
        {tab === "register" && <RegisterTab />}
        {tab === "edit" && <EditMyTeamTab />}
        {tab === "rules" && <RulesTab />}
        {tab === "admin" && adminUiMode && <AdminTab />}
      </main>
    </AppCtx.Provider>
  );
}
