"use client";

import React, { useState } from "react";
import { useApp } from "../poule-context.jsx";
import { LANGUAGES, TIMEZONES } from "../../../lib/wk/locale";
import { PHOTOS } from "./constants.js";

export function Header() {
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
export function SettingsModal(props) {
  const { theme, setTheme, lang, setLang, currentLang, t, tz, setTz, adminMode, setTab } = useApp();

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

        {adminMode ? (
          <div className="settings-section settings-admin-section">
            <div className="settings-label" style={{ marginBottom: 8 }}>
              {t.superadminLabel || "Superadmin"}
            </div>
            <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "0 0 10px", lineHeight: 1.45 }}>
              {t.superadminHint || "Full access. The Admin tab is only visible to this account."}
            </p>
            <button
              className="settings-admin-btn settings-admin-active"
              type="button"
              onClick={function() {
                setTab("admin");
                props.onClose();
              }}
            >
              {t.openAdminPanel || "Open admin panel"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
