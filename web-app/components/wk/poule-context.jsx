"use client";

import React, { createContext, useContext } from "react";

export function computeTotalPoints(p) {
  if (p && p.totalPoints !== undefined && p.totalPoints !== null) {
    return Number(p.totalPoints) || 0;
  }
  let spelers = p.spelers;
  if (typeof spelers === "string") {
    try {
      spelers = JSON.parse(spelers);
    } catch {
      return 0;
    }
  }
  if (!Array.isArray(spelers)) return 0;
  return spelers.reduce(function (sum, sp) {
    return sum + (Number(sp.punten) || 0);
  }, 0);
}

export const AppCtx = createContext(null);

export function useApp() {
  return useContext(AppCtx);
}
