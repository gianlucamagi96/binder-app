import { useId, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
};

export function Input({ label, hint, id, className = "", ...props }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-foreground-secondary">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`h-11 rounded-[var(--radius-md)] border border-border bg-surface px-3.5 text-sm text-foreground shadow-xs placeholder:text-foreground-muted transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--color-accent-soft)] ${className}`}
        {...props}
      />
      {hint && <p className="text-xs text-foreground-muted">{hint}</p>}
    </div>
  );
}
