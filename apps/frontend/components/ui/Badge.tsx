import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "warning" | "ember";

const TONES: Record<Tone, string> = {
  neutral: "border-border bg-surface text-foreground-muted",
  accent: "border-accent/20 bg-accent-soft text-accent-text",
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-warning/20 bg-warning-soft text-warning",
  ember: "border-ember/20 bg-ember-soft text-ember",
};

export function Badge({
  children,
  tone = "neutral",
  mono = false,
}: {
  children: ReactNode;
  tone?: Tone;
  /** Solo per badge che mostrano un dato tecnico reale (%, conteggio). */
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] font-medium tracking-wide ${
        mono ? "font-mono" : ""
      } ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
