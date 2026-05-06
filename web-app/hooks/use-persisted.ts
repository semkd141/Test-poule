"use client";

import { useEffect, useState } from "react";

/**
 * Mirrors localStorage for resilient client prefs (theme, lang, tz, admin).
 */
export function usePersisted<T>(key: string, init: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? (JSON.parse(s) as T) : init;
    } catch {
      return init;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* ignore quota / private mode */
    }
  }, [key, v]);

  return [v, setV];
}
