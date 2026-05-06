"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import * as XLSX from "xlsx";
import { usePersisted } from "@/hooks/use-persisted";
import {
  authSaveSession,
  authLoadSession,
  authClearSession,
  authSendMagicLink,
  authRefreshSession,
  authGetValidSession,
  authVerifyOTP,
  authSignOut,
  authGetUser,
  getMyDeelnemer,
  dbLees,
  dbLeesSpelers,
  dbToevoegen,
  dbBijwerkenSpelers,
  dbBijwerkenVeld,
} from "@/lib/wk/api-client";
import { WC_START, getSupabasePublicUrl, getAdminPassword, buildPhotos } from "@/lib/wk/config";
import { parseConfig } from "@/lib/wk/parse-config";
import { LANGUAGES, TIMEZONES } from "@/lib/wk/locale";
import { T } from "@/lib/wk/strings";
import {
  GROUPS,
  ALL_COUNTRIES,
  GROUP_MATCHES,
  KNOCKOUT,
  FORMATIONS,
  flag,
} from "@/lib/wk/tournament";
import { formatDateLocalized } from "@/lib/wk/datetime";
import { AppCtx, useApp, computeTotalPoints } from "@/components/wk/poule-context";

const PHOTOS = buildPhotos(getSupabasePublicUrl());
const ADMIN_WACHTWOORD = getAdminPassword();

function App() {
  const [theme, setTheme] = usePersisted("wk26_theme", "dark");
  const [lang, setLang] = usePersisted("wk26_lang", "en");
  const [tz, setTz] = usePersisted("wk26_tz", "Europe/London");
  const [adminMode, setAdminMode] = usePersisted("wk26_admin", false);

  // Tab state: driven by URL hash so sharing a link works
  // Default for new visitors: 'register'
  function getInitialTab() {
    var hash = window.location.hash.replace("#", "");
    var valid = ["ranking","matches","results","teams","register","edit","rules","admin"];
    if (hash && valid.indexOf(hash) !== -1) return hash;
    return "register";
  }
  const [tab, setTabRaw] = useState(getInitialTab);

  function setTab(t) {
    window.location.hash = t;
    setTabRaw(t);
  }

  // Sync tab if hash changes externally (back/forward button)
  useEffect(function() {
    function onHash() {
      var hash = window.location.hash.replace("#","");
      var valid = ["ranking","matches","results","teams","register","edit","rules","admin"];
      if (hash && valid.indexOf(hash) !== -1) setTabRaw(hash);
    }
    window.addEventListener("hashchange", onHash);
    return function() { window.removeEventListener("hashchange", onHash); };
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

  // If user navigates to admin tab but isn't admin, redirect to ranking
  useEffect(function() {
    if (tab === "admin" && !adminMode) setTab("ranking");
  }, [tab, adminMode]);

  const ctx = { theme, setTheme, lang, setLang, tz, setTz, currentLang, t, participants, config, reloadParticipants: loadParticipants, loading, adminMode, setAdminMode, setTab, wkSpelers };

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
        {tab === "admin" && adminMode && <AdminTab />}
      </main>
    </AppCtx.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════
//  HEADER
// ═══════════════════════════════════════════════════════════════
function Header() {
  const { t } = useApp();
  const [openSettings, setOpenSettings] = useState(false);

  const titleParts = t.title.split(" ");
  const firstPart = titleParts.slice(0, -1).join(" ");
  const lastPart = titleParts[titleParts.length - 1];

  return (
    <React.Fragment>
      <header className="header">
        <img src={PHOTOS.virgil} alt="" className="header-bg-virgil" onError={function(e){e.target.style.display="none";}} />
        <div className="header-gradient-accent"></div>
        <div className="header-inner">
          <div className="title-block">
            <img src={PHOTOS.trophy} alt="trophy" className="trophy" onError={function(e){e.target.style.display="none";}} />
            <div className="title-text">
              <h1>{firstPart} <span className="accent">{lastPart}</span></h1>
              <div className="sub">{t.subtitle}</div>
            </div>
          </div>
          <div className="header-actions">
            <button className="settings-btn" onClick={function(){setOpenSettings(true);}} aria-label="Settings" title={t.settings || "Settings"}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
        </div>
      </header>
      {openSettings && <SettingsModal onClose={function(){setOpenSettings(false);}} />}
    </React.Fragment>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SETTINGS MODAL
// ═══════════════════════════════════════════════════════════════
function SettingsModal(props) {
  const { theme, setTheme, lang, setLang, currentLang, t, tz, setTz, adminMode, setAdminMode, setTab } = useApp();
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");

  function tryLogin() {
    if (pw === ADMIN_WACHTWOORD) {
      setAdminMode(true);
      setShowAdminLogin(false);
      setPw("");
      setPwErr("");
      props.onClose();
      setTab("admin");
    } else {
      setPwErr(t.wrongPw || "Wrong password");
    }
  }

  function logoutAdmin() {
    setAdminMode(false);
    setTab("ranking");
    props.onClose();
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal settings-modal" onClick={function(e){e.stopPropagation();}}>
        <div className="settings-header">
          <div className="modal-title" style={{margin:0}}>{t.settings || "Instellingen"}</div>
          <button className="modal-close" onClick={props.onClose} aria-label="Close">✕</button>
        </div>

        {/* THEME */}
        <div className="settings-section">
          <div className="settings-label">{t.themeLabel || "Thema"}</div>
          <div className="settings-options">
            <button
              className={"settings-option " + (theme === "dark" ? "active" : "")}
              onClick={function(){setTheme("dark");}}
            >🌙 {t.darkTheme || "Donker"}</button>
            <button
              className={"settings-option " + (theme === "light" ? "active" : "")}
              onClick={function(){setTheme("light");}}
            >☀️ {t.lightTheme || "Licht"}</button>
          </div>
        </div>

        {/* LANGUAGE */}
        <div className="settings-section">
          <div className="settings-label">{t.languageLabel || "Taal"}</div>
          <div className="settings-options-grid">
            {LANGUAGES.map(function(l) {
              return (
                <button
                  key={l.code}
                  className={"settings-option " + (l.code === lang ? "active" : "")}
                  onClick={function(){setLang(l.code);}}
                >
                  <span style={{fontSize:18, marginRight:6}}>{l.flag}</span>
                  <span>{l.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* TIMEZONE */}
        <div className="settings-section">
          <div className="settings-label">{t.timezoneLabel || "Tijdzone"}</div>
          <select
            value={tz}
            onChange={function(e){setTz(e.target.value);}}
            style={{margin:0}}
          >
            {TIMEZONES.map(function(z) {
              return <option key={z.tz} value={z.tz}>{z.flag} {z.label} ({z.short})</option>;
            })}
          </select>
        </div>

        {/* ADMIN LOGIN / LOGOUT */}
        <div className="settings-section settings-admin-section">
          {!adminMode ? (
            !showAdminLogin ? (
              <button className="settings-admin-btn" onClick={function(){setShowAdminLogin(true);}}>
                🔒 {t.adminLogin || "Beheer login"}
              </button>
            ) : (
              <div>
                <div className="settings-label" style={{marginBottom:8}}>{t.adminLogin || "Beheer login"}</div>
                <input
                  type="password"
                  placeholder={t.password || "Wachtwoord"}
                  value={pw}
                  onChange={function(e){setPw(e.target.value); setPwErr("");}}
                  onKeyDown={function(e){if(e.key==="Enter") tryLogin();}}
                  style={{margin:"0 0 8px"}}
                  autoFocus
                />
                {pwErr && <div className="error" style={{marginBottom:8}}>{pwErr}</div>}
                <div style={{display:"flex", gap:8}}>
                  <button className="btn btn-outline" onClick={function(){setShowAdminLogin(false); setPw(""); setPwErr("");}} style={{flex:1}}>
                    {t.cancel || "Annuleren"}
                  </button>
                  <button className="btn" onClick={tryLogin} style={{flex:1}}>{t.login || "Inloggen"}</button>
                </div>
              </div>
            )
          ) : (
            <button className="settings-admin-btn settings-admin-active" onClick={logoutAdmin}>
              ✓ {t.adminLoggedIn || "Ingelogd als beheerder"} — {t.logout || "Uitloggen"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════════════════════════
function Tabs(props) {
  const { t, adminMode } = useApp();
  // Admin tab only visible if logged in as admin (via gear menu)
  const keys = adminMode
    ? ["ranking","matches","results","teams","register","edit","rules","admin"]
    : ["ranking","matches","results","teams","register","edit","rules"];
  const wrapRef = useRef(null);
  const navRef = useRef(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(function() {
    function check() {
      if (!navRef.current) return;
      const el = navRef.current;
      const overflowed = el.scrollWidth > el.clientWidth + 2;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      setHasOverflow(overflowed && !atEnd);
    }
    check();
    window.addEventListener("resize", check);
    if (navRef.current) navRef.current.addEventListener("scroll", check);
    return function() {
      window.removeEventListener("resize", check);
      if (navRef.current) navRef.current.removeEventListener("scroll", check);
    };
  }, []);

  return (
    <div ref={wrapRef} className={"tabs-wrap " + (hasOverflow ? "has-overflow" : "")}>
      <nav ref={navRef} className="tabs">
        {keys.map(function(k) {
          return (
            <button key={k} className={"tab " + (props.active === k ? "active" : "")} onClick={function(){props.onChange(k);}}>
              {t.tabs[k]}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function FloatingDecor() { return null; }

// ═══════════════════════════════════════════════════════════════
//  RANKING
// ═══════════════════════════════════════════════════════════════
function RankingTab() {
  const { participants, t, loading } = useApp();
  const ranked = useMemo(function() {
    return participants.map(function(p) {
      return Object.assign({}, p, { totalPts: computeTotalPoints(p) });
    }).sort(function(a, b) { return b.totalPts - a.totalPts; });
  }, [participants]);

  if (loading) return <div className="spinner"></div>;
  if (ranked.length === 0) return (
    <div className="card">
      <div className="empty-state">
        <img src={PHOTOS.trophy} alt="" className="empty-state-photo" onError={function(e){e.target.style.display="none";}} />
        <div>{t.noParticipants}</div>
      </div>
    </div>
  );

  const first = ranked[0], second = ranked[1], third = ranked[2];

  return (
    <React.Fragment>
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
          {ranked.map(function(p, i) {
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
    3: "sepia(1) saturate(2) hue-rotate(-15deg) brightness(0.85) drop-shadow(0 4px 10px rgba(176,141,87,0.5))"
  };
  return (
    <div className={"podium-step " + props.cls}>
      <div className="podium-trophy">
        <img
          src={PHOTOS.trophy}
          alt={"#" + props.rank}
          style={{height: isWinner ? 70 : 56, width:"auto", filter: trophyFilters[props.rank]}}
          onError={function(e){e.target.style.display="none";}}
        />
      </div>
      <div className="podium-rank">#{props.rank}</div>
      <div className="podium-name">{props.step.naam}</div>
      <div className="podium-team">{props.step.teamnaam}</div>
      <div className="podium-points">{props.step.totalPts} <span style={{fontSize:"12px",opacity:0.6}}>{t.pts}</span></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MATCHES
// ═══════════════════════════════════════════════════════════════
function MatchesTab() {
  const { t } = useApp();
  const [sub, setSub] = useState("schedule");
  return (
    <React.Fragment>
      <div className="card" style={{marginBottom:16, display:"flex", gap:8, flexWrap:"wrap"}}>
        <button className={"tab " + (sub==="schedule"?"active":"")} onClick={function(){setSub("schedule");}}>{t.matchSchedule}</button>
        <button className={"tab " + (sub==="groups"?"active":"")} onClick={function(){setSub("groups");}}>{t.groups}</button>
        <button className={"tab " + (sub==="knockout"?"active":"")} onClick={function(){setSub("knockout");}}>{t.knockout}</button>
      </div>
      {sub === "schedule" && <ScheduleView />}
      {sub === "groups" && <GroupsView />}
      {sub === "knockout" && <KnockoutView />}
    </React.Fragment>
  );
}

function ScheduleView() {
  const { lang, t, tz } = useApp();

  const currentTzInfo = TIMEZONES.find(function(z) { return z.tz === tz; }) || TIMEZONES[1];

  const grouped = useMemo(function() {
    const map = new Map();
    GROUP_MATCHES.forEach(function(mt) {
      const info = formatDateLocalized(mt.date, mt.time, lang, tz);
      const key = info.dateObj.toISOString().slice(0,10) + "|" + info.dateLabel;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(mt);
    });
    return Array.from(map.entries()).sort(function(a, b) { return a[0].localeCompare(b[0]); });
  }, [lang, tz]);

  return (
    <React.Fragment>
      <div style={{
        background:"linear-gradient(135deg, rgba(255,107,0,0.12), rgba(255,107,0,0.04))",
        border:"1px solid var(--orange)",
        borderRadius:12,
        padding:"12px 16px",
        marginBottom:16,
        display:"flex",
        alignItems:"center",
        gap:12,
        flexWrap:"wrap"
      }}>
        <span style={{fontSize:22}}>🕐</span>
        <div style={{flex:1, minWidth:160}}>
          <div style={{fontSize:10,letterSpacing:"0.15em",color:"var(--orange)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{t.timezoneInfo}</div>
          <div style={{fontFamily:"var(--wk-heading-font)",fontSize:18,letterSpacing:"0.05em"}}>
            {currentTzInfo.flag} {currentTzInfo.label} ({currentTzInfo.short})
          </div>
        </div>
        <div style={{fontSize:11,color:"var(--fg-muted)",fontStyle:"italic"}}>{t.changeInSettings || "Wijzig in instellingen ⚙️"}</div>
      </div>
      {grouped.map(function(entry) {
        const key = entry[0], matches = entry[1];
        const dateLabel = key.split("|")[1];
        return (
          <div key={key}>
            <div className="match-date-header">{dateLabel}</div>
            {matches.slice().sort(function(a, b) {
              return formatDateLocalized(a.date,a.time,lang,tz).dateObj - formatDateLocalized(b.date,b.time,lang,tz).dateObj;
            }).map(function(mt, i) { return <MatchRow key={i} match={mt} />; })}
          </div>
        );
      })}
    </React.Fragment>
  );
}

function MatchRow(props) {
  const { lang, tz, t } = useApp();
  const info = formatDateLocalized(props.match.date, props.match.time, lang, tz);
  return (
    <div className="match-row">
      <div><div className="match-team left">{props.match.home}</div></div>
      <div style={{textAlign:"center"}}>
        <div className="match-vs">{info.timeLabel}</div>
        <div className="match-meta">
          <span className="badge">{t.groupLabel} {props.match.group}</span>
          <span>📍 {props.match.city}</span>
        </div>
      </div>
      <div><div className="match-team right">{props.match.away}</div></div>
    </div>
  );
}

function GroupsView() {
  const { t } = useApp();
  return (
    <div className="groups-grid">
      {Object.entries(GROUPS).map(function(entry) {
        const letter = entry[0], teams = entry[1];
        return (
          <div key={letter} className="group-card">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <div className="group-letter" style={{margin:0}}>{letter}</div>
              <div style={{fontFamily:"var(--wk-heading-font)",fontSize:18,color:"var(--fg-muted)",letterSpacing:"0.1em",textTransform:"uppercase"}}>{t.groupLabel} {letter}</div>
            </div>
            {teams.map(function(team) {
              return (
                <div key={team} className="group-team">
                  <span>{team}</span>
                  <span style={{color:"var(--fg-muted)",fontSize:12}}>—</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function KnockoutView() {
  const { t } = useApp();
  return (
    <div className="card">
      <div className="card-title">{t.knockout}</div>
      <div style={{fontSize:13,color:"var(--fg-muted)",marginBottom:18,padding:"12px 16px",background:"var(--bg-3)",borderRadius:10,borderLeft:"3px solid var(--orange)"}}>
        {t.knockoutInfo || "De knockout-wedstrijden worden ingevuld zodra de groepsfase is afgelopen."}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:16}}>
        {KNOCKOUT.map(function(k) {
          return (
            <div key={k.stage} className="group-card" style={{textAlign:"center"}}>
              <div className="group-letter" style={{width:"auto",padding:"0 14px",marginBottom:8}}>{t[k.stage]}</div>
              <div style={{color:"var(--fg-muted)",fontSize:13}}>{k.matches} {k.matches === 1 ? "match" : "matches"}</div>
              <div style={{fontSize:12,marginTop:6,opacity:0.5,fontStyle:"italic"}}>{t.tbd || "TBD"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RESULTS (countdown)
// ═══════════════════════════════════════════════════════════════
function ResultsTab() {
  const { t } = useApp();
  const [now, setNow] = useState(Date.now());
  useEffect(function() {
    const id = setInterval(function() { setNow(Date.now()); }, 1000);
    return function() { clearInterval(id); };
  }, []);

  const diff = WC_START.getTime() - now;
  const started = diff <= 0;
  const d = Math.max(0, Math.floor(diff / (1000*60*60*24)));
  const h = Math.max(0, Math.floor((diff / (1000*60*60)) % 24));
  const mi = Math.max(0, Math.floor((diff / (1000*60)) % 60));
  const s = Math.max(0, Math.floor((diff / 1000) % 60));

  return (
    <div className="countdown-wrap">
      <img src={PHOTOS.wcPhoto} alt="" className="countdown-wc-bg" onError={function(e){e.target.style.display="none";}} />
      <div className="countdown-label">{started ? t.started : t.countdownTo}</div>
      {!started && (
        <div className="countdown-grid">
          <div className="countdown-unit"><div className="countdown-num">{String(d).padStart(2,"0")}</div><div className="countdown-unit-label">{t.days}</div></div>
          <div className="countdown-unit"><div className="countdown-num">{String(h).padStart(2,"0")}</div><div className="countdown-unit-label">{t.hours}</div></div>
          <div className="countdown-unit"><div className="countdown-num">{String(mi).padStart(2,"0")}</div><div className="countdown-unit-label">{t.minutes}</div></div>
          <div className="countdown-unit"><div className="countdown-num">{String(s).padStart(2,"0")}</div><div className="countdown-unit-label">{t.seconds}</div></div>
        </div>
      )}
      <div style={{marginTop:24,color:"var(--fg-muted)",fontSize:13,position:"relative"}}>{t.resultsPage}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  TEAMS
// ═══════════════════════════════════════════════════════════════
function TeamsTab() {
  const { participants, t, loading } = useApp();
  const [search, setSearch] = useState("");

  if (loading) return <div className="spinner"></div>;
  if (participants.length === 0) return (
    <div className="card">
      <div className="empty-state">
        <img src={PHOTOS.trophy} alt="" className="empty-state-photo" onError={function(e){e.target.style.display="none";}} />
        <div>{t.noTeamsYet}</div>
      </div>
    </div>
  );

  const q = search.trim().toLowerCase();
  const filtered = q === "" ? participants : participants.filter(function(p) {
    const teamMatch = (p.teamnaam || "").toLowerCase().indexOf(q) !== -1;
    const nameMatch = (p.naam || "").toLowerCase().indexOf(q) !== -1;
    return teamMatch || nameMatch;
  });

  return (
    <React.Fragment>
      <div style={{marginBottom:16,position:"relative"}}>
        <input
          type="text"
          placeholder={t.searchPlaceholder || "Zoek team..."}
          value={search}
          onChange={function(e){setSearch(e.target.value);}}
          style={{margin:0,paddingLeft:42,paddingRight:search ? 42 : 14}}
        />
        <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:18,opacity:0.5,pointerEvents:"none"}}>🔎</span>
        {search && (
          <button
            type="button"
            onClick={function(){setSearch("");}}
            style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",fontSize:18,opacity:0.6,cursor:"pointer",padding:6,color:"var(--fg)"}}
            aria-label="Clear"
          >✕</button>
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="card"><div className="empty-state">Geen teams gevonden voor "{search}"</div></div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))",gap:16}}>
          {filtered.map(function(p) { return <TeamCard key={p.id} participant={p} />; })}
        </div>
      )}
    </React.Fragment>
  );
}

// Aanvoerdersband SVG component
function CaptainBand(props) {
  var sz = props.size || 28;
  var h = Math.round(sz * 0.65);
  var active = props.active !== false;
  var fill = active ? "#FF6B00" : "#888";
  var dark = active ? "#E85D00" : "#666";
  var stripe = Math.round(h * 0.22);
  return (
    <svg width={sz} height={h} viewBox={"0 0 " + sz + " " + h} style={{display:"block",flexShrink:0}} aria-label="Captain">
      <rect x="0" y="0" width={sz} height={h} rx="3" fill={fill}/>
      <rect x="0" y="0" width={sz} height={stripe} rx="2" fill={dark}/>
      <rect x="0" y={h - stripe} width={sz} height={stripe} rx="2" fill={dark}/>
      <text x={sz/2} y={h * 0.72} textAnchor="middle" fontFamily="Georgia, serif" fontSize={Math.round(h * 0.52)} fontWeight="900" fill="#1a1a1a">C</text>
    </svg>
  );
}

function TeamCard(props) {
  let spelers = props.participant.spelers;
  if (typeof spelers === "string") { try { spelers = JSON.parse(spelers); } catch { spelers = []; } }
  if (!Array.isArray(spelers)) spelers = [];
  return (
    <div className="card">
      <div className="card-title" style={{justifyContent:"space-between",display:"flex"}}>
        <span>{props.participant.teamnaam}</span>
        <span className="badge">{props.participant.systeem}</span>
      </div>
      <div style={{fontSize:13,color:"var(--fg-muted)",marginBottom:10}}>{props.participant.naam}</div>
      <FormationField spelers={spelers} system={props.participant.systeem} />
    </div>
  );
}

function FormationField(props) {
  const { t } = useApp();
  const f = FORMATIONS[props.system] || FORMATIONS["4-3-3"];
  const spelers = props.spelers || [];
  const keepers = spelers.filter(function(s) { return s.positie === "keeper"; });
  const defs = spelers.filter(function(s) { return s.positie === "def"; });
  const mids = spelers.filter(function(s) { return s.positie === "mid"; });
  const atts = spelers.filter(function(s) { return s.positie === "att"; });
  const coach = spelers.filter(function(s) { return s.positie === "coach"; })[0];

  function Slot(ps) {
    const sp = ps.sp;
    const isCaptain = sp && sp.aanvoerder;
    return (
      <div className={"pos-slot " + (sp ? "filled" : "")} style={isCaptain ? {border:"2px solid #FFD700",boxShadow:"0 0 8px rgba(255,215,0,0.4)"} : {}}>
        {isCaptain && (
          <div style={{position:"absolute",top:-10,right:4,zIndex:3}}>
            <CaptainBand size={32}/>
          </div>
        )}
        <div className="pos-slot-label">{ps.label}</div>
        {sp ? (
          sp.spelerNaam && sp.spelerNaam.trim() ? (
            <React.Fragment>
              <div className="pos-slot-name">{sp.spelerNaam}</div>
              <div className="pos-slot-country-line">
                <span className="pos-slot-flag-inline">{flag(sp.land)}</span>
                <span className="pos-slot-country">{sp.land}</span>
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div className="pos-slot-name">{sp.land}</div>
              <div className="pos-slot-country-line">
                <span className="pos-slot-flag-inline">{flag(sp.land)}</span>
              </div>
            </React.Fragment>
          )
        ) : (
          <div className="pos-slot-country" style={{opacity:0.5}}>—</div>
        )}
      </div>
    );
  }

  return (
    <React.Fragment>
      <div className="squad-formation">
        {/* Football field decorations - bottom half only (own half) */}
        <div className="field-corner bl"></div>
        <div className="field-corner br"></div>
        <div className="field-pen-bot"></div>
        <div className="field-goal-bot"></div>
        <div className="field-pen-arc-bot"></div>
        <div className="field-spot bot"></div>
        <div className="field-center"></div>

        {/* Player slots - aanvallers near halfway line, keeper near goal */}
        <div className="pos-row">
          {atts.map(function(sp, i) { return <Slot key={"a"+i} sp={sp} label={t.pos.att} />; })}
          {atts.length === 0 && Array(f.att).fill(0).map(function(_, i) { return <Slot key={"ae"+i} label={t.pos.att} />; })}
        </div>
        <div className="pos-row">
          {mids.map(function(sp, i) { return <Slot key={"m"+i} sp={sp} label={t.pos.mid} />; })}
          {mids.length === 0 && Array(f.mid).fill(0).map(function(_, i) { return <Slot key={"me"+i} label={t.pos.mid} />; })}
        </div>
        <div className="pos-row">
          {defs.map(function(sp, i) { return <Slot key={"d"+i} sp={sp} label={t.pos.def} />; })}
          {defs.length === 0 && Array(f.def).fill(0).map(function(_, i) { return <Slot key={"de"+i} label={t.pos.def} />; })}
        </div>
        <div className="pos-row">
          {keepers.map(function(sp, i) { return <Slot key={"k"+i} sp={sp} label={t.pos.keeper} />; })}
          {keepers.length === 0 && <Slot label={t.pos.keeper} />}
        </div>
      </div>
      {coach && (coach.spelerNaam || coach.land) && (
        <div style={{marginTop:14, display:"flex", justifyContent:"center"}}>
          <div className="pos-slot filled" style={{width:220,background:"linear-gradient(135deg,#FFD700,#FFA500)",color:"#18181B",padding:"10px 14px"}}>
            <div className="pos-slot-label">{t.pos.coach}</div>
            <div className="pos-slot-name">{coach.spelerNaam || coach.land || "—"}</div>
            {coach.land && !coach.spelerNaam && (
              <div className="pos-slot-country-line">
                <span className="pos-slot-flag-inline">{flag(coach.land)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

// ═══════════════════════════════════════════════════════════════
//  REGISTER
// ═══════════════════════════════════════════════════════════════
function RegisterTab() {
  const { t, participants, config, reloadParticipants, wkSpelers } = useApp();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ naam:"", teamnaam:"", email:"", systeem:"4-3-3" });
  const [spelers, setSpelers] = useState({ keeper:[null], def:[null,null,null,null], mid:[null,null,null], att:[null,null,null], coach:[null] });
  const [captain, setCaptain] = useState(null); // { pos, index } — which slot is captain
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openPicker, setOpenPicker] = useState(null);
  const [openPlayerPicker, setOpenPlayerPicker] = useState(null);

  const deadlinePassed = Date.now() > config.deadline.getTime();
  const formation = FORMATIONS[form.systeem];

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

  if (deadlinePassed) return <div className="card"><div className="empty-state" style={{color:"var(--orange)"}}>{t.deadlinePassed}</div></div>;
  if (success) return <div className="card"><div className="success">{t.successReg}</div></div>;

  function handleNext() {
    setError("");
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

    const emailLower = form.email.trim().toLowerCase();
    const isDup = participants.some(function(p) {
      return (p.email || "").toLowerCase() === emailLower;
    });
    if (isDup) return setError(t.duplicateEmail || "Dit e-mailadres is al geregistreerd. Eén team per e-mailadres toegestaan.");

    setSubmitting(true);
    try {
      await dbToevoegen({
        naam: form.naam.trim(),
        teamnaam: form.teamnaam.trim(),
        email: form.email.trim(),
        systeem: form.systeem,
        spelers: flat
      });
      setSuccess(true);
      await reloadParticipants();
    } catch (e) {
      console.error(e);
      setError("Fout bij inschrijven: " + (e.message || "onbekend"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="step-indicator">
        <div className={"step-dot " + (step >= 1 ? "active" : "")}>1</div>
        <div className={"step-line " + (step >= 2 ? "active" : "")}></div>
        <div className={"step-dot " + (step >= 2 ? "active" : "")}>2</div>
      </div>
      <div style={{fontSize:13,color:"var(--fg-muted)",marginBottom:14}}>
        {t.deadlineBefore} <strong style={{color:"var(--orange)"}}>{config.deadlineLabel}</strong>
      </div>

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
          <button className="btn" onClick={handleNext}>{t.next} →</button>
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

function CountryPicker(props) {
  const { t } = useApp();
  const [q, setQ] = useState("");
  const filtered = ALL_COUNTRIES.filter(function(c) { return c.toLowerCase().indexOf(q.toLowerCase()) !== -1; });

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={function(e){e.stopPropagation();}}>
        <div className="modal-title">{t.selectCountry}</div>
        <input placeholder="🔍" value={q} onChange={function(e){setQ(e.target.value);}} autoFocus />
        <div className="country-grid">
          {filtered.map(function(c) {
            const isTaken = props.taken.has(c);
            return (
              <button
                key={c}
                className="country-btn"
                disabled={isTaken}
                title={isTaken ? t.countryTaken : ""}
                onClick={function(){ if (!isTaken) props.onPick(c); }}
              >
                <span style={{fontSize:"1.2em",marginRight:4}}>{flag(c)}</span>{c}
              </button>
            );
          })}
        </div>
        <div style={{marginTop:12,textAlign:"end"}}>
          <button className="btn btn-outline" onClick={props.onClose}>{t.back}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  EDIT MY TEAM (magic link auth)
// ═══════════════════════════════════════════════════════════════
function EditMyTeamTab() {
  const { t, participants, config, reloadParticipants, wkSpelers } = useApp();

  // Auth state
  const [authState, setAuthState] = useState("loading"); // loading | unauthenticated | sending | sent | authenticated | no_team
  const [session, setSession] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [emailInput, setEmailInput] = useState("");
  const [authError, setAuthError] = useState("");

  // Edit state
  const [editNaam, setEditNaam] = useState("");
  const [editTeamnaam, setEditTeamnaam] = useState("");
  const [editSpelers, setEditSpelers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  // On mount: check for magic link callback (access_token in URL hash) OR existing session
  useEffect(function() {
    async function init() {
      const hash = window.location.hash;
      // Supabase magic link returns #access_token=...&refresh_token=...
      if (hash && hash.indexOf('access_token=') !== -1) {
        const params = new URLSearchParams(hash.replace(/^#/, ''));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        const expires_in = parseInt(params.get('expires_in') || '3600');
        if (access_token) {
          // Fetch user info
          let user = {};
          try {
            user = await authGetUser(access_token);
          } catch(e) {}
          const sessionData = { access_token, refresh_token, expires_at: Math.floor(Date.now()/1000) + expires_in, user };
          authSaveSession(sessionData);
          // Clean URL - go back to #edit
          window.history.replaceState({}, document.title, window.location.pathname + '#edit');
          await loadTeamForSession(sessionData);
          return;
        }
      }
      // Check existing session
      const existing = await authGetValidSession();
      if (existing && existing.access_token) {
        await loadTeamForSession(existing);
      } else {
        setAuthState("unauthenticated");
      }
    }
    init();
  }, []);

  async function loadTeamForSession(sess) {
    setSession(sess);
    const email = sess.user && sess.user.email;
    if (!email) { setAuthState("unauthenticated"); return; }
    const team = await getMyDeelnemer(email);
    if (!team) {
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
      await authSendMagicLink(emailInput.trim());
      setAuthState("sent");
    } catch(e) {
      setAuthError(e.message);
      setAuthState("unauthenticated");
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
      alert("Error saving: " + e.message);
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
          <div style={{fontFamily:"var(--wk-heading-font)",fontSize:16,letterSpacing:"0.05em",color:"var(--orange)",marginBottom:8}}>
            Sign in to edit your team
          </div>
          <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:16,lineHeight:1.6}}>
            Enter the email address you used to register. We'll send you a secure login link — no password needed.
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

  if (authState === "no_team") {
    return (
      <div>
        <div className="card-title">My Team</div>
        <div className="card" style={{maxWidth:480}}>
          <p style={{fontSize:14,marginBottom:16}}>
            No team found for <strong>{session && session.user && session.user.email}</strong>.
          </p>
          <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:16}}>
            Did you register with a different email? Or haven't registered yet?
          </p>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button className="btn btn-outline" onClick={signOut}>Try different email</button>
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
        <div style={{display:"flex",alignItems:"center",gap:10}}>
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

// ═══════════════════════════════════════════════════════════════
//  RULES
// ═══════════════════════════════════════════════════════════════
function RulesTab() {
  const { t, config } = useApp();
  const r = t.rulesContent || {};

  return (
    <React.Fragment>
      <div className="card">
        <div className="card-title">📋 {r.title || "Spelregels"}</div>
        <p style={{lineHeight:1.6, color:"var(--fg)", marginBottom:14}}>
          {r.intro || "Welkom bij de WK 2026 Poule! Hieronder lees je hoe het spel werkt, hoe je punten verdient en wat de belangrijkste regels zijn."}
        </p>
      </div>

      {/* HOW IT WORKS */}
      <div className="card">
        <div className="card-title" style={{fontSize:18}}>{r.howTitle || "Hoe werkt het?"}</div>
        <ol style={{paddingLeft:20, lineHeight:1.7}}>
          <li>{r.how1 || "Schrijf je in vóór de inschrijfdeadline."}</li>
          <li>{r.how2 || "Kies een spelsysteem (4-3-3, 4-4-2 of 3-4-3)."}</li>
          <li>{r.how3 || "Selecteer voor elke positie een land. Per persoon mag je elk land maar één keer kiezen."}</li>
          <li>{r.how4 || "Vul de naam van de bondscoach in."}</li>
          <li>{r.how5 || "Tijdens het toernooi krijg je punten op basis van prestaties van de gekozen landen en spelers."}</li>
          <li>{r.how6 || "Wie aan het einde de meeste punten heeft, wint!"}</li>
        </ol>
      </div>

      {/* DEADLINE */}
      <div className="card" style={{borderLeft:"3px solid var(--orange)"}}>
        <div className="card-title" style={{fontSize:18}}>⏰ {r.deadlineTitle || "Inschrijfdeadline"}</div>
        <p style={{lineHeight:1.6}}>
          {r.deadlineText || "Inschrijven kan tot:"} <strong style={{color:"var(--orange)"}}>{config.deadlineLabel}</strong>.
          {" "}{r.deadlineNote || "Daarna is inschrijven niet meer mogelijk en kun je je team niet meer wijzigen."}
        </p>
      </div>

      {/* POINTS SYSTEM */}
      <div className="card">
        <div className="card-title" style={{fontSize:18}}>{r.pointsTitle || "Puntentelling"}</div>
        <p style={{fontSize:13, color:"var(--fg-muted)", marginBottom:14}}>
          {r.pointsIntro || "Punten verschillen per positie. Aanvallers krijgen meer punten voor doelpunten, verdedigers voor cleansheets, enz."}
        </p>

        <div style={{overflowX:"auto", marginBottom:18}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:520}}>
            <thead>
              <tr style={{background:"var(--bg-3)"}}>
                <th style={{padding:"10px 12px", textAlign:"left", fontFamily:"var(--wk-heading-font)", fontSize:14, letterSpacing:"0.05em", color:"var(--orange)"}}>{r.eventCol || "Gebeurtenis"}</th>
                <th style={{padding:"10px 8px", textAlign:"center", fontSize:11, color:"var(--orange)"}}>🥅 {t.pos.keeper}</th>
                <th style={{padding:"10px 8px", textAlign:"center", fontSize:11, color:"var(--orange)"}}>🛡 {t.pos.def}</th>
                <th style={{padding:"10px 8px", textAlign:"center", fontSize:11, color:"var(--orange)"}}>🎯 {t.pos.mid}</th>
                <th style={{padding:"10px 8px", textAlign:"center", fontSize:11, color:"var(--orange)"}}>⚽ {t.pos.att}</th>
                <th style={{padding:"10px 8px", textAlign:"center", fontSize:11, color:"var(--orange)"}}>👔 {t.pos.coach}</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evWin || "Wedstrijd gewonnen (land)"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+3</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evDraw || "Gelijkspel (land)"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+1</td><td style={{padding:"8px", textAlign:"center"}}>+1</td><td style={{padding:"8px", textAlign:"center"}}>+1</td><td style={{padding:"8px", textAlign:"center"}}>+1</td><td style={{padding:"8px", textAlign:"center"}}>+1</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evGoal || "Doelpunt"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+10</td><td style={{padding:"8px", textAlign:"center"}}>+5</td><td style={{padding:"8px", textAlign:"center"}}>+4</td><td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>—</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evAssist || "Assist"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+5</td><td style={{padding:"8px", textAlign:"center"}}>+4</td><td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+2</td><td style={{padding:"8px", textAlign:"center"}}>—</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evClean || "Wedstrijd zonder tegendoelpunten"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+1</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evPenalty || "Penalty gestopt"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evOg || "Eigen doelpunt"}</td>
                <td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−3</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−3</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evYellow || "Gele kaart"}</td>
                <td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−1</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−1</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−1</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−1</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−1</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.ev2Yellow || "2x geel = rood"}</td>
                <td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−2</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−2</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−2</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−2</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−2</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evRed || "Directe rode kaart"}</td>
                <td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−4</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−4</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−4</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−4</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−4</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evSub || "Geslaagde wissel (doelpunt na wissel)"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>+1</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)", background:"var(--orange-soft)"}}>
                <td style={{padding:"8px 12px", fontWeight:700}}>🏆 {r.evChampion || "World Champion"}</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
              </tr>
              <tr style={{background:"rgba(255,215,0,0.08)", borderTop:"2px solid #FFD700"}}>
                <td style={{padding:"8px 12px", fontWeight:700, display:"flex", alignItems:"center", gap:8}}>
                  <CaptainBand size={28}/> {r.captainTitle || "Captain"} — {r.evChampion || "World Champion"}
                </td>
                <td style={{padding:"8px", textAlign:"center", fontWeight:700, color:"#FF6B00"}}>+3</td>
                <td style={{padding:"8px", textAlign:"center", fontWeight:700, color:"#FF6B00"}}>+3</td>
                <td style={{padding:"8px", textAlign:"center", fontWeight:700, color:"#FF6B00"}}>+3</td>
                <td style={{padding:"8px", textAlign:"center", fontWeight:700, color:"#FF6B00"}}>+3</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* RULES */}
      <div className="card">
        <div className="card-title" style={{fontSize:18}}>{r.rulesTitle || "Belangrijke regels"}</div>
        <ul style={{paddingLeft:20, lineHeight:1.8}}>
          <li>{r.rule1 || "Je kunt je inschrijven met één e-mailadres — één team per persoon."}</li>
          <li>{r.rule2 || "Binnen jouw team mag elk land maar één keer voorkomen."}</li>
          <li>{r.rule3 || "Andere deelnemers mogen wel hetzelfde land kiezen — er is geen exclusiviteit tussen teams."}</li>
          <li>{r.rule4 || "Na de inschrijfdeadline kun je je team niet meer wijzigen."}</li>
          <li>{r.rule5 || "Punten worden continu bijgewerkt door de beheerder tijdens het toernooi."}</li>
          <li>{r.rule6 || "Bij gelijke eindstand wint degene met de meeste doelpunten van zijn aanvallers."}</li>
        </ul>
      </div>

      {/* CAPTAIN */}
      <div className="card" style={{borderLeft:"3px solid #FFD700"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <CaptainBand size={32}/>
          <div className="card-title" style={{fontSize:18,margin:0}}>{r.captainTitle || "Captain"}</div>
        </div>
        <p style={{lineHeight:1.6, marginBottom:10}}>
          {r.captainText || "You choose one player from your team as captain. If that player's country becomes world champion, your captain earns the champion bonus points — just like all your other players from that country. The captain itself does not give extra bonus points on top."}
        </p>
        <div style={{background:"var(--bg-3)",borderRadius:10,padding:"12px 16px",fontSize:13}}>
          <strong>Example:</strong> You pick Virgil van Dijk (🇳🇱 Netherlands) as captain.
          Netherlands becomes world champion. Virgil then earns:
          <ul style={{marginTop:8,paddingLeft:20,lineHeight:1.8}}>
            <li>+3 pt (champion bonus for defender — same as all your other Netherlands players)</li>
            <li>The captain badge is a visual marker only — it does not add extra points</li>
          </ul>
          <div style={{marginTop:8,padding:"8px 12px",background:"rgba(255,107,0,0.08)",borderRadius:8,borderLeft:"3px solid var(--orange)"}}>
            💡 <strong>Strategy tip:</strong> Pick a player from a country you think will go far — the champion bonus is worth +3 pt for every player from that country in your team.
          </div>
        </div>
        <p style={{fontSize:13,color:"var(--fg-muted)",marginTop:10,lineHeight:1.6}}>
          {r.captainNote || "Your captain is shown with a orange armband on your team board. Choose wisely — a favourite country gives the best chance of earning the bonus!"}
        </p>
      </div>

      {/* EXAMPLE TEAM */}
      <div className="card">
        <div className="card-title" style={{fontSize:18}}>📋 {r.exampleTitle || "Example team (4-3-3)"}</div>
        <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:14,lineHeight:1.6}}>
          {r.exampleIntro || "A valid team example. Each country used only once, captain marked with the armband."}
        </p>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:360}}>
            <thead>
              <tr style={{background:"var(--bg-3)"}}>
                <th style={{padding:"8px 12px",textAlign:"left",color:"var(--orange)",fontFamily:"var(--wk-heading-font)",fontSize:14}}>Position</th>
                <th style={{padding:"8px 12px",textAlign:"left",color:"var(--orange)",fontFamily:"var(--wk-heading-font)",fontSize:14}}>Player</th>
                <th style={{padding:"8px 12px",textAlign:"left",color:"var(--orange)",fontFamily:"var(--wk-heading-font)",fontSize:14}}>Country</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Goalkeeper","Bart Verbruggen","🇳🇱 Netherlands"],
                ["Defender","Achraf Hakimi","🇲🇦 Morocco"],
                ["Defender","Alejandro Grimaldo","🇪🇸 Spain"],
                ["Defender","Joško Gvardiol","🇭🇷 Croatia"],
                ["Defender","William Saliba","🇫🇷 France"],
                ["Midfielder ⚽ Captain","Jude Bellingham","🏴󠁧󠁢󠁥󠁮󠁧󠁿 England"],
                ["Midfielder","Florian Wirtz","🇩🇪 Germany"],
                ["Midfielder","Tijjani Reijnders","🇮🇹 Italy"],
                ["Forward","Vinícius Júnior","🇧🇷 Brazil"],
                ["Forward","Lautaro Martínez","🇦🇷 Argentina"],
                ["Forward","Erling Haaland","🇳🇴 Norway"],
                ["Coach","Lionel Scaloni","🇦🇷 ⛔"],
              ].map(function(row, i) {
                const isBad = row[2].indexOf("⛔") !== -1;
                const isCap = row[0].indexOf("Captain") !== -1;
                return (
                  <tr key={i} style={{borderTop:"1px solid var(--border)",background:isBad?"rgba(239,68,68,0.08)":isCap?"rgba(255,215,0,0.06)":"transparent"}}>
                    <td style={{padding:"8px 12px",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                      {isCap && <CaptainBand size={22}/>}
                      {row[0].replace(" ⚽ Captain","")}
                    </td>
                    <td style={{padding:"8px 12px"}}>{row[1]}</td>
                    <td style={{padding:"8px 12px",color:isBad?"#EF4444":"var(--fg)"}}>{isBad ? row[2].replace("⛔","") : row[2]}{isBad ? " ← ERROR: Argentina already used!" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{fontSize:12,color:"#EF4444",marginTop:10}}>
          ⚠️ {r.exampleNote || "In this example, Argentina is used twice — Lautaro Martínez as forward AND Scaloni as coach. That's not allowed. Each country only once per team."}
        </p>
      </div>

      {/* COMMON MISTAKES */}
      <div className="card">
        <div className="card-title" style={{fontSize:18}}>{r.mistakesTitle || "Common mistakes"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {[
            ["Same country twice", "You pick Mbappé (🇫🇷 France) as forward AND Deschamps (🇫🇷 France) as coach. Not allowed — each country may appear only once in your team."],
            ["Forgetting the coach", "Without a head coach your team cannot be submitted. The coach is required."],
            ["Picking a country but forgetting the player", "After selecting a country, you must also select a player. The slot stays highlighted until you complete the selection."],
            ["Forgetting to pick a captain", "Click the armband icon next to a player after selecting them. Without a captain you miss out on the champion bonus if your country wins."],
            ["Registering too late", "After the deadline registration is no longer possible. Make sure you sign up on time!"],
          ].map(function(item, i) {
            return (
              <div key={i} style={{display:"flex",gap:12,padding:"12px 14px",background:"var(--bg-3)",borderRadius:10,borderLeft:"3px solid var(--orange)"}}>
                <div style={{flexShrink:0,width:28,height:28,borderRadius:"50%",background:"var(--orange)",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13}}>{i+1}</div>
                <div>
                  <div style={{fontWeight:700,marginBottom:4}}>{item[0]}</div>
                  <div style={{fontSize:13,color:"var(--fg-muted)",lineHeight:1.5}}>{item[1]}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CONTACT */}
      <div className="card" style={{background:"var(--bg-3)", border:"none"}}>
        <div style={{fontSize:13, color:"var(--fg-muted)", lineHeight:1.6}}>
          💬 <strong>{r.contactText || "Heb je vragen of zie je een fout in de puntentelling? Neem contact op met de organisator van de poule."}</strong>
        </div>
        <div style={{fontSize:13, color:"var(--fg-muted)", lineHeight:1.6, marginTop:8}}>
          🔒 <strong>{r.privacyTitle || "Privacy"}:</strong> {r.privacyText || "Je e-mailadres wordt alleen gebruikt om dubbele inschrijvingen te voorkomen en wordt niet gedeeld met derden."}
        </div>
      </div>
    </React.Fragment>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════
function AdminTab() {
  const { t, participants, config, reloadParticipants, setAdminMode, setTab } = useApp();
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Deadline editing state
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineLabel, setDeadlineLabel] = useState("");
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [deadlineSaved, setDeadlineSaved] = useState(false);

  // Initialize deadline editor with current config
  useEffect(function() {
    const d = config.deadline;
    if (d && !isNaN(d.getTime())) {
      const pad = function(n){ return String(n).padStart(2,"0"); };
      const localStr = d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
      setDeadlineDate(localStr);
    }
    setDeadlineLabel(config.deadlineLabel || "");
  }, [config.deadline.getTime(), config.deadlineLabel]);

  async function saveDeadline() {
    if (!deadlineDate) return;
    setSavingDeadline(true);
    try {
      const isoDate = new Date(deadlineDate).toISOString();
      const cfgPayload = { deadline: isoDate, deadlineLabel: deadlineLabel || DEFAULT_DEADLINE_LABEL };
      if (config.cfgRowId) {
        await dbBijwerkenSpelers(config.cfgRowId, cfgPayload);
      } else {
        await dbToevoegen({
          naam: "__config__",
          teamnaam: "__config__",
          email: "__config__",
          systeem: "config",
          spelers: cfgPayload
        });
      }
      setDeadlineSaved(true);
      setTimeout(function(){ setDeadlineSaved(false); }, 2500);
      await reloadParticipants();
    } catch (e) {
      alert("Fout: " + e.message);
    } finally {
      setSavingDeadline(false);
    }
  }

  function doLogout() {
    setAdminMode(false);
    setTab("ranking");
    setConfirmLogout(false);
  }

  function exportExcel() {
    const rows = [];
    participants.forEach(function(p) {
      let sp = p.spelers;
      if (typeof sp === "string") { try { sp = JSON.parse(sp); } catch { sp = []; } }
      if (!Array.isArray(sp)) sp = [];
      const totalPts = sp.reduce(function(s, x) { return s + (Number(x.punten) || 0); }, 0);
      rows.push({
        Naam: p.naam,
        Teamnaam: p.teamnaam,
        Email: p.email,
        Systeem: p.systeem,
        TotaalPunten: totalPts,
        Spelers: sp.map(function(x) {
          if (x.positie === "coach") return "coach:" + (x.spelerNaam || "?") + " [" + (x.punten || 0) + "pt]";
          return x.positie + ":" + (x.spelerNaam || x.land || "?") + (x.land && x.spelerNaam ? " (" + x.land + ")" : "") + " [" + (x.punten || 0) + "pt]";
        }).join(" | ")
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "WK2026");
    XLSX.writeFile(wb, "wk2026_poule.xlsx");
  }

  return (
    <div className="card">
      <div className="card-title" style={{justifyContent:"space-between",display:"flex",flexWrap:"wrap",gap:10}}>
        <span>{t.adminPanel}</span>
        <div style={{display:"flex",gap:8}}>
          <button className="btn" onClick={exportExcel}>📊 {t.exportExcel}</button>
          <button className="btn btn-outline" onClick={function(){setConfirmLogout(true);}}>{t.logout}</button>
        </div>
      </div>

      {/* Deadline configuration */}
      <div style={{padding:"14px 16px",background:"var(--bg-3)",borderRadius:10,marginBottom:18,borderLeft:"3px solid var(--orange)"}}>
        <div style={{fontFamily:"var(--wk-heading-font)",fontSize:16,letterSpacing:"0.05em",color:"var(--orange)",marginBottom:10}}>
          {t.deadlineConfig || "Inschrijfdeadline instellen"}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:10,marginBottom:10}}>
          <div>
            <label>{t.deadlineDateLabel || "Datum & tijd"}</label>
            <input
              type="datetime-local"
              value={deadlineDate}
              onChange={function(e){setDeadlineDate(e.target.value);}}
              style={{margin:0}}
            />
          </div>
          <div>
            <label>{t.deadlineDisplayLabel || "Weergegeven tekst"}</label>
            <input
              type="text"
              placeholder="bijv. 10 juni 2026"
              value={deadlineLabel}
              onChange={function(e){setDeadlineLabel(e.target.value);}}
              style={{margin:0}}
            />
          </div>
        </div>
        <button className="btn" onClick={saveDeadline} disabled={savingDeadline} style={{marginTop:4}}>
          {savingDeadline ? "…" : deadlineSaved ? "✓ " + t.saved : (t.saveDeadline || "Deadline opslaan")}
        </button>
      </div>

      {participants.length === 0 ? (
        <div className="empty-state">{t.noParticipants}</div>
      ) : (
        participants.map(function(p) {
          return <AdminRow key={p.id} participant={p} onReload={reloadParticipants} />;
        })
      )}

      {/* Logout confirmation modal */}
      {confirmLogout && (
        <div className="modal-backdrop" onClick={function(){setConfirmLogout(false);}}>
          <div className="modal" onClick={function(e){e.stopPropagation();}} style={{maxWidth:380}}>
            <div className="modal-title">{t.logout}?</div>
            <div style={{color:"var(--fg-muted)",fontSize:14,marginBottom:18}}>
              {t.confirmLogout || "Weet je zeker dat je wilt uitloggen uit het beheerpaneel?"}
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button className="btn btn-outline" onClick={function(){setConfirmLogout(false);}}>
                {t.cancel || "Annuleren"}
              </button>
              <button className="btn" onClick={doLogout}>{t.logout}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminRow(props) {
  const { t, wkSpelers } = useApp();
  let initial = props.participant.spelers;
  if (typeof initial === "string") { try { initial = JSON.parse(initial); } catch { initial = []; } }
  if (!Array.isArray(initial)) initial = [];
  const initialNormalized = initial.map(function(x) { return Object.assign({}, x, { punten: Number(x.punten) || 0 }); });

  const [local, setLocal] = useState(initialNormalized);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initialNormalized.map(function(x){return x.punten;})));
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const autoSaveTimer = useRef(null);
  const isMounted = useRef(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editTeamnaam, setEditTeamnaam] = useState(props.participant.teamnaam || "");
  const [editNaam, setEditNaam] = useState(props.participant.naam || "");
  const [editSysteem, setEditSysteem] = useState(props.participant.systeem || "4-3-3");
  const [editSpelers, setEditSpelers] = useState(initialNormalized.slice());
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

  // wkSpelers lookup for player dropdowns in edit mode
  const spelersByLandPos = useMemo(function() {
    const m = {};
    (wkSpelers || []).forEach(function(s) {
      const k = s.land + "|" + s.positie;
      if (!m[k]) m[k] = [];
      m[k].push(s);
    });
    return m;
  }, [wkSpelers]);

  useEffect(function() {
    const norm = initial.map(function(x) { return Object.assign({}, x, { punten: Number(x.punten) || 0 }); });
    setLocal(norm);
    setSavedSnapshot(JSON.stringify(norm.map(function(x){return x.punten;})));
  }, [props.participant.id, props.participant.spelers]);

  useEffect(function() {
    if (props.saved) {
      setSavedSnapshot(JSON.stringify(local.map(function(x){return x.punten;})));
    }
  }, [props.saved]);

  function updatePts(i, val) {
    setLocal(function(prev) {
      return prev.map(function(x, idx) {
        return idx === i ? Object.assign({}, x, { punten: Number(val) || 0 }) : x;
      });
    });
  }

  const total = local.reduce(function(s, x) { return s + (Number(x.punten) || 0); }, 0);
  const currentSnapshot = JSON.stringify(local.map(function(x){return x.punten;}));
  const isDirty = currentSnapshot !== savedSnapshot;

  // Debounced autosave
  useEffect(function() {
    // Skip on first mount
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    if (!isDirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async function() {
      setAutoSaving(true);
      try {
        await dbBijwerkenSpelers(props.participant.id, local);
        setSavedSnapshot(currentSnapshot);
        setAutoSaved(true);
        setTimeout(function(){ setAutoSaved(false); }, 1800);
      } catch (e) {
        console.error("Autosave failed", e);
      } finally {
        setAutoSaving(false);
      }
    }, 1000);
    return function() {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [currentSnapshot, isDirty]);

  useEffect(function() {
    setEditTeamnaam(props.participant.teamnaam || "");
    setEditNaam(props.participant.naam || "");
    setEditSysteem(props.participant.systeem || "4-3-3");
    let orig = props.participant.spelers;
    if (typeof orig === "string") { try { orig = JSON.parse(orig); } catch { orig = []; } }
    setEditSpelers(Array.isArray(orig) ? orig.map(function(x){ return Object.assign({},x,{punten:Number(x.punten)||0}); }) : []);
  }, [props.participant.id]);

  async function saveEdit() {
    if (!editTeamnaam.trim() || !editNaam.trim()) {
      alert(t.fillRequired || "Fill in team name and name");
      return;
    }
    setSavingEdit(true);
    try {
      await dbBijwerkenVeld(props.participant.id, {
        teamnaam: editTeamnaam.trim(),
        naam: editNaam.trim(),
        systeem: editSysteem,
        spelers: JSON.stringify(editSpelers)
      });
      setEditSaved(true);
      setTimeout(function(){ setEditSaved(false); setEditing(false); }, 1200);
      if (props.onReload) await props.onReload();
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSavingEdit(false);
    }
  }

  function cancelEdit() {
    setEditTeamnaam(props.participant.teamnaam || "");
    setEditNaam(props.participant.naam || "");
    setEditSysteem(props.participant.systeem || "4-3-3");
    // Reset spelers
    let orig = props.participant.spelers;
    if (typeof orig === "string") { try { orig = JSON.parse(orig); } catch { orig = []; } }
    setEditSpelers(Array.isArray(orig) ? orig.slice() : []);
    setEditing(false);
  }

  function handleSysteemChange(newSys) {
    const newF = FORMATIONS[newSys];
    if (!newF) return;
    setEditSysteem(newSys);
    // Rebuild spelers array to match new formation, keeping existing where possible
    const byPos = { keeper: [], def: [], mid: [], att: [], coach: [] };
    editSpelers.forEach(function(s) { if (byPos[s.positie]) byPos[s.positie].push(s); });
    // Trim or pad each position
    ["keeper","def","mid","att"].forEach(function(pos) {
      const target = pos === "keeper" ? 1 : newF[pos];
      while (byPos[pos].length < target) byPos[pos].push({ land:"", spelerNaam:"", positie:pos, punten:0 });
      byPos[pos] = byPos[pos].slice(0, target);
    });
    setEditSpelers([].concat(byPos.keeper, byPos.def, byPos.mid, byPos.att, byPos.coach));
  }

  return (
    <div className="group-card" style={{marginBottom:14, borderColor: isDirty ? "var(--orange)" : "var(--border)", transition:"border-color .2s"}}>
      {editing ? (
        <div style={{marginBottom:14, padding:"14px", background:"var(--bg-3)", borderRadius:10}}>
          <div className="settings-label" style={{marginBottom:10}}>{t.editTeam || "Edit team"}</div>
          {/* Basic info */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10, marginBottom:14}}>
            <div>
              <label style={{fontSize:11}}>{t.teamName || "Team name"}</label>
              <input type="text" value={editTeamnaam} onChange={function(e){setEditTeamnaam(e.target.value);}} style={{margin:0}} />
            </div>
            <div>
              <label style={{fontSize:11}}>{t.userName || "Name"}</label>
              <input type="text" value={editNaam} onChange={function(e){setEditNaam(e.target.value);}} style={{margin:0}} />
            </div>
            <div>
              <label style={{fontSize:11}}>{t.system || "Formation"}</label>
              <select value={editSysteem} onChange={function(e){ handleSysteemChange(e.target.value); }} style={{margin:0}}>
                {Object.keys(FORMATIONS).map(function(k){ return <option key={k} value={k}>{k}</option>; })}
              </select>
            </div>
          </div>
          {/* Players editor */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",color:"var(--orange)",marginBottom:8}}>Players</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {editSpelers.map(function(sp, i) {
                if (!sp) return null;
                const isCoach = sp.positie === "coach";
                const key = (sp.land || "") + "|" + sp.positie;
                const wkOptions = spelersByLandPos[key] || [];
                return (
                  <div key={i} style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",background:"white",borderRadius:8,padding:"8px 10px",border:"1px solid var(--border)"}}>
                    <span style={{width:75,flexShrink:0,fontSize:10,fontWeight:700,textTransform:"uppercase",color:"var(--orange)",letterSpacing:"0.04em"}}>
                      {t.pos[sp.positie] || sp.positie}
                    </span>
                    {/* Country/land */}
                    <input
                      type="text"
                      value={sp.land || ""}
                      placeholder="Country"
                      onChange={function(e){
                        setEditSpelers(function(prev){ const n=prev.slice(); n[i]=Object.assign({},n[i],{land:e.target.value}); return n; });
                      }}
                      style={{width:120,flexShrink:0,margin:0,fontSize:12,padding:"4px 8px"}}
                    />
                    {/* Player name */}
                    {!isCoach && wkOptions.length > 0 ? (
                      <select
                        value={sp.spelerNaam || ""}
                        onChange={function(e){
                          setEditSpelers(function(prev){ const n=prev.slice(); n[i]=Object.assign({},n[i],{spelerNaam:e.target.value}); return n; });
                        }}
                        style={{flex:1,margin:0,fontSize:12,padding:"4px 8px"}}
                      >
                        <option value="">— select —</option>
                        {wkOptions.map(function(o){ return <option key={o.id} value={o.naam}>{o.naam}</option>; })}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={sp.spelerNaam || ""}
                        placeholder={isCoach ? "Coach name" : "Player name"}
                        onChange={function(e){
                          setEditSpelers(function(prev){ const n=prev.slice(); n[i]=Object.assign({},n[i],{spelerNaam:e.target.value}); return n; });
                        }}
                        style={{flex:1,margin:0,fontSize:12,padding:"4px 8px"}}
                      />
                    )}
                    {/* Captain toggle */}
                    {!isCoach && (
                      <button
                        type="button"
                        title={sp.aanvoerder ? "Remove captain" : "Make captain"}
                        onClick={function(){
                          setEditSpelers(function(prev){
                            return prev.map(function(s,j){
                              return Object.assign({},s,{aanvoerder: j===i ? !s.aanvoerder : false});
                            });
                          });
                        }}
                        style={{background:"transparent",border:"none",cursor:"pointer",padding:"2px",flexShrink:0}}
                      >
                        <CaptainBand size={22} active={!!sp.aanvoerder}/>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
            <button className="btn btn-outline" onClick={cancelEdit} disabled={savingEdit}>{t.cancel || "Cancel"}</button>
            <button className="btn" onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? "…" : editSaved ? "✓ " + (t.saved || "Saved") : (t.save || "Save")}
            </button>
          </div>
        </div>
      ) : (
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontWeight:700, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
              <span>{props.participant.teamnaam}</span>
              <button
                onClick={function(){setEditing(true);}}
                aria-label="Edit"
                title={t.edit || "Edit"}
                style={{background:"transparent",border:"none",cursor:"pointer",fontSize:13,opacity:0.5,padding:"2px 6px",borderRadius:4,color:"var(--fg-muted)"}}
                onMouseEnter={function(e){e.target.style.opacity="1";e.target.style.color="var(--orange)";}}
                onMouseLeave={function(e){e.target.style.opacity="0.5";e.target.style.color="var(--fg-muted)";}}
              >✎</button>
              {/* Delete button */}
              <button
                onClick={async function(){
                  if (!window.confirm("Verwijder team '" + props.participant.teamnaam + "'? Dit kan niet ongedaan worden gemaakt.")) return;
                  try {
                    const r = await fetch(DB + "/participants/" + props.participant.id, {
                      method:"DELETE", headers:HDR
                    });
                    if (r.ok && props.onReload) await props.onReload();
                    else alert("Fout bij verwijderen");
                  } catch(e){ alert("Fout: " + e.message); }
                }}
                title="Team verwijderen"
                style={{background:"transparent",border:"none",cursor:"pointer",fontSize:13,opacity:0.4,padding:"2px 6px",borderRadius:4,color:"#EF4444"}}
                onMouseEnter={function(e){e.target.style.opacity="1";}}
                onMouseLeave={function(e){e.target.style.opacity="0.4";}}
              >🗑</button>
              {autoSaving ? (
                <span style={{fontSize:11, padding:"2px 8px", background:"var(--bg-3)", color:"var(--fg-muted)", borderRadius:6, fontWeight:600, letterSpacing:"0.05em"}}>
                  {t.savingAutosave || "Saving…"}
                </span>
              ) : isDirty ? (
                <span style={{fontSize:11, padding:"2px 8px", background:"var(--orange)", color:"white", borderRadius:6, fontWeight:600, letterSpacing:"0.05em"}}>
                  {t.unsaved || "Unsaved"}
                </span>
              ) : autoSaved ? (
                <span style={{fontSize:11, padding:"2px 8px", background:"#10B981", color:"white", borderRadius:6, fontWeight:600, letterSpacing:"0.05em"}}>
                  ✓ {t.saved}
                </span>
              ) : null}
            </div>
            <div style={{fontSize:12,color:"var(--fg-muted)"}}>{props.participant.naam} • {props.participant.systeem}</div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <span className="badge">Totaal: {total}</span>
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))",gap:6}}>
        {local.map(function(sp, i) {
          const posLabel = t.pos[sp.positie] || sp.positie;
          return (
            <div key={i} className="admin-player">
              <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                <strong style={{color:"var(--orange)"}}>{posLabel}</strong>
                <span style={{color:"var(--fg-muted)"}}> · </span>
                {sp.positie === "coach" ? (
                  <span style={{fontWeight:600}}>{sp.spelerNaam || "—"}</span>
                ) : sp.spelerNaam && sp.spelerNaam.trim() ? (
                  <React.Fragment>
                    <span style={{fontWeight:600}}>{sp.spelerNaam}</span>
                    <span style={{color:"var(--fg-muted)",fontSize:"0.9em"}}> ({sp.land})</span>
                  </React.Fragment>
                ) : (
                  <span style={{fontWeight:600}}>{sp.land}</span>
                )}
              </span>
              <input
                type="number"
                className="admin-input-mini"
                value={sp.punten}
                onChange={function(e){updatePts(i, e.target.value);}}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PouleShell() {
  return <App />;
}
