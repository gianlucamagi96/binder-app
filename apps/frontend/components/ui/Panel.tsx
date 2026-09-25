import type { HTMLAttributes, ReactNode } from "react";

export function Panel({
  children,
  className = "",
  interactive = false,
  elevated = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  interactive?: boolean;
  elevated?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-border bg-surface ${
        elevated ? "shadow-md" : "shadow-xs"
      } ${
        interactive
          ? "transition-[border-color,box-shadow,transform] duration-150 hover:border-border-strong hover:shadow-sm active:scale-[0.995]"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
