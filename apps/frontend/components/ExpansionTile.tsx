import Link from "next/link";
import type { Expansion } from "@/lib/catalog";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";

export function ExpansionTileSkeleton() {
  return (
    <Panel className="flex w-full flex-col items-center gap-2.5 p-4">
      <Skeleton className="h-14 w-full sm:h-16" />
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </Panel>
  );
}

function formatDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

function ExpansionTileContent({ expansion }: { expansion: Expansion }) {
  return (
    <>
      <div className="flex h-14 w-full items-center justify-center sm:h-16">
        {expansion.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={expansion.logo}
            alt={expansion.name}
            className="max-h-14 max-w-full object-contain sm:max-h-16"
            loading="lazy"
          />
        ) : (
          <span className="text-sm font-medium text-foreground-muted">{expansion.name}</span>
        )}
      </div>
      <p className="line-clamp-2 text-sm font-semibold text-foreground">{expansion.name}</p>
      <p className="font-mono text-[11px] text-foreground-muted">
        {formatDate(expansion.releaseDate)}
        <span className="ml-1.5 border-l border-border pl-1.5">
          {expansion.cardCount.total} carte
        </span>
      </p>
    </>
  );
}

export function ExpansionTile({
  expansion,
  href,
  className = "",
}: {
  expansion: Expansion;
  href?: string;
  className?: string;
}) {
  if (href) {
    return (
      <Link href={href} className="block w-full">
        <Panel
          interactive
          className={`flex w-full flex-col items-center gap-2.5 p-4 text-center ${className}`}
        >
          <ExpansionTileContent expansion={expansion} />
        </Panel>
      </Link>
    );
  }

  return (
    <Panel
      interactive
      className={`flex w-44 shrink-0 flex-col items-center gap-2.5 p-4 text-center sm:w-52 ${className}`}
    >
      <ExpansionTileContent expansion={expansion} />
    </Panel>
  );
}
