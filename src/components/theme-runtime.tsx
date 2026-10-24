"use client";
import { useEffect } from "react";
import { applyTheme, THEME_KEY, type ThemePreference } from "@/lib/theme";
export function ThemeRuntime() {
  useEffect(() => {
    const sync = () => {
      let preference: ThemePreference = "light";
      try {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored === "dark" || stored === "system") preference = stored;
      } catch {}
      applyTheme(preference);
    };
    sync();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return null;
}
export function ProfileTheme({ preference }: { preference: ThemePreference }) {
  useEffect(() => applyTheme(preference), [preference]);
  return null;
}
