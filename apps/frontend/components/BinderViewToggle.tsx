"use client";

import { LayoutGrid, Library } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { BinderView } from "@/hooks/useBinderViewPreference";

export function BinderViewToggle({
  view,
  onChange,
}: {
  view: BinderView;
  onChange: (view: BinderView) => void;
}) {
  return (
    <div role="group" aria-label="Tipo di vista" className="inline-flex items-center gap-1">
      <Button
        size="sm"
        variant={view === "grid" ? "primary" : "secondary"}
        aria-pressed={view === "grid"}
        onClick={() => onChange("grid")}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
        Griglia
      </Button>
      <Button
        size="sm"
        variant={view === "library" ? "primary" : "secondary"}
        aria-pressed={view === "library"}
        onClick={() => onChange("library")}
      >
        <Library className="h-4 w-4" aria-hidden />
        Libreria
      </Button>
    </div>
  );
}
