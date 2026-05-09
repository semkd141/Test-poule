"use client";

import React, { useState, useEffect } from "react";
import { WC_START } from "@/lib/wk/config";
import { useApp } from "../poule-context.jsx";
import { PHOTOS } from "./constants.js";

export function ResultsTab() {
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
