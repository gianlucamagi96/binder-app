import type { FeaturedCard } from "@/lib/catalog";
import { Skeleton } from "@/components/ui/Skeleton";

export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-2 shadow-card">
      <Skeleton className="aspect-[5/7] w-full rounded-[var(--radius-md)]" />
      <div className="flex flex-col gap-1.5 px-1 pb-1.5">
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}

export function Card({
  card,
  onClick,
}: {
  card: FeaturedCard;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="relative flex aspect-[5/7] items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-background">
        {card.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image}
            alt={card.name}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <span className="px-2 text-center text-xs text-foreground-muted">{card.name}</span>
        )}
      </div>

      <div className="flex flex-col gap-0.5 px-1 pb-1.5">
        <p className="truncate text-sm font-semibold text-foreground">{card.name}</p>
        <p className="truncate text-xs text-foreground-muted">{card.set.name}</p>
        {card.rarity && (
          <p className="truncate text-[11px] font-medium text-accent-text/80">{card.rarity}</p>
        )}
        {(card.types.length > 0 || card.hp !== null) && (
          <p className="truncate font-mono text-[11px] text-foreground-muted">
            {card.types.length > 0 && <span>{card.types.join(" / ")}</span>}
            {card.types.length > 0 && card.hp !== null && (
              <span className="ml-2 border-l border-border pl-2">HP {card.hp}</span>
            )}
            {card.types.length === 0 && card.hp !== null && <span>HP {card.hp}</span>}
          </p>
        )}
      </div>
    </>
  );

  const classes =
    "group flex w-full flex-col gap-2.5 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-2 text-left shadow-card transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md";

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }

  return <article className={classes}>{content}</article>;
}
