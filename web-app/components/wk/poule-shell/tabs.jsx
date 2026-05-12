"use client";

import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../poule-context.jsx";

export function Tabs(props) {
  const { t, adminMode, showPoolPointsTab } = useApp();
  const baseUser = ["ranking","matches","results","teams","competitions","register","edit","rules","competition"];
  const userKeys = showPoolPointsTab ? baseUser.concat(["poolPoints"]) : baseUser.slice();
  // Superadmin: Admin tab only. Other logged-in users: Points management tab (same tooling as Admin points, for their pools).
  const keys = adminMode
    ? ["ranking","matches","results","teams","competitions","register","edit","rules","competition","admin"]
    : userKeys;
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
