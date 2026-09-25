"use client";

import { useCallback, useState } from "react";
import type { BinderListItem } from "@/lib/binders";

/**
 * Shared open/close for the grid and the library.
 * Closing refreshes the list, same as the grid did before the split.
 */
export function useOpenBinder(onClosed: () => void) {
  const [binder, setBinder] = useState<BinderListItem | null>(null);

  const open = useCallback((next: BinderListItem) => {
    setBinder(next);
  }, []);

  const close = useCallback(() => {
    setBinder(null);
    onClosed();
  }, [onClosed]);

  return { binder, open, close };
}
