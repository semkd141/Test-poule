"use client";

import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../poule-context.jsx";

export function Tabs(props) {
  const { t, adminMode } = useApp();
  // Admin tab only visible if logged in as admin (via gear menu)
  const keys = adminMode
    ? ["ranking","matches","results","teams","competitions","register","edit","rules","competition","admin"]
    : ["ranking","matches","results","teams","competitions","register","edit","rules","competition"];
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
