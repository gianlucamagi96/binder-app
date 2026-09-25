"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { BinderListItem } from "@/lib/binders";
import { Badge } from "@/components/ui/Badge";

const TYPE_LABELS: Record<BinderListItem["type"], string> = {
  GAME: "Gioco",
  EXPANSION: "Espansione",
  ARTIST: "Artista",
  FREE: "Libero",
};

function CoverPlaceholder({ rows, cols }: { rows: number; cols: number }) {
  const cellCount = Math.min(rows * cols, 9);
  const gridCols = Math.min(cols, 3);
  return (
    <div
      className="grid h-14 w-16 gap-1"
      style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cellCount }).map((_, i) => (
        <div key={i} className="rounded-[3px] border border-border-strong/70 bg-surface-hover" />
      ))}
    </div>
  );
}

export function BinderTile({
  binder,
  onOpen,
  hidden,
}: {
  binder: BinderListItem;
  onOpen: () => void;
  hidden?: boolean;
}) {
  const coverSrc = binder.cover.image ?? binder.cover.logo;
  const reduceMotion = useReducedMotion();
  const completionPct =
    binder.completion !== null ? Math.round(binder.completion * 100) : null;

  return (
    <motion.div
      layoutId={`binder-card-${binder.id}`}
      transition={reduceMotion ? { duration: 0 } : undefined}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      style={{ opacity: hidden ? 0 : 1 }}
      className="group flex cursor-pointer flex-col gap-3 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-3 text-left shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-4"
    >
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-gradient-to-br from-background to-accent-soft/40">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverSrc}
            alt=""
            className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <CoverPlaceholder rows={binder.rows} cols={binder.cols} />
        )}
        {completionPct !== null && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-border/60">
            <div
              className="h-full rounded-r-full bg-accent transition-[width] duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p className="truncate text-sm font-semibold text-foreground sm:text-[15px]">
          {binder.name}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{TYPE_LABELS[binder.type]}</Badge>
          {completionPct !== null && (
            <Badge tone={completionPct >= 100 ? "success" : "accent"} mono>
              {completionPct}%
            </Badge>
          )}
        </div>
      </div>
    </motion.div>
  );
}
