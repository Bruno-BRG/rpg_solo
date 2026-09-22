"use client";
/**
 * Theme toggle — flips `html.dark` and persists the choice.
 * On first load the inline script in the root layout applies the
 * stored (or system) theme before paint; this button only flips it.
 */
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      className="btn-ghost mt-2 w-full justify-between text-xs"
      aria-label="Toggle dark theme"
      type="button"
    >
      <span>Theme</span>
      <span>{dark ? "☾ dark" : "☀ light"}</span>
    </button>
  );
}
