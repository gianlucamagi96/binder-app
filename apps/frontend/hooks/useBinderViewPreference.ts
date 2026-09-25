"use client";

import { useCallback, useEffect, useState } from "react";
import { librarySupported, probeLibrarySupport } from "@/lib/library-capability";

export type BinderView = "grid" | "library";

const STORAGE_KEY = "binder.bindersView";

type Support = "pending" | "ok" | "blocked";

export function useBinderViewPreference() {
  const [preference, setPreference] = useState<BinderView | null>(null);
  const [support, setSupport] = useState<Support>("pending");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setPreference(saved === "library" ? "library" : "grid");
    try {
      setSupport(librarySupported(probeLibrarySupport()) ? "ok" : "blocked");
    } catch {
      setSupport("blocked");
    }
  }, []);

  const setView = useCallback((next: BinderView) => {
    setPreference(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const ready = preference !== null && support !== "pending";
  const view: BinderView = ready && support === "ok" && preference === "library" ? "library" : "grid";
  const libraryBlocked = support === "blocked" && preference === "library";

  return { view, setView, ready, libraryBlocked };
}
