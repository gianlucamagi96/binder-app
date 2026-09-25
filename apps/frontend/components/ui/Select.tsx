import { useId, type ReactNode, type SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  children: ReactNode;
};

export function Select({ label, id, className = "", children, ...props }: Props) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-foreground-secondary">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`h-11 rounded-[var(--radius-md)] border border-border bg-surface px-3.5 text-sm text-foreground shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--color-accent-soft)] ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
