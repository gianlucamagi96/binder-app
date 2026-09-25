import type { ReactNode } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { Panel } from "@/components/ui/Panel";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "empty" | "error";
  icon?: ReactNode;
};

export function EmptyState({ title, description, action, tone = "empty", icon }: Props) {
  const defaultIcon =
    tone === "error" ? (
      <AlertCircle className="h-6 w-6" strokeWidth={1.75} aria-hidden />
    ) : (
      <Inbox className="h-6 w-6" strokeWidth={1.75} aria-hidden />
    );

  return (
    <Panel className="flex flex-col items-center gap-4 px-6 py-14 text-center sm:py-16">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full ${
          tone === "error"
            ? "bg-danger-soft text-danger-foreground"
            : "bg-accent-soft text-accent-text"
        }`}
      >
        {icon ?? defaultIcon}
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <p
          className={`text-base font-semibold tracking-tight ${
            tone === "error" ? "text-danger-foreground" : "text-foreground"
          }`}
        >
          {title}
        </p>
        {description && <p className="text-sm leading-relaxed text-foreground-muted">{description}</p>}
      </div>
      {action}
    </Panel>
  );
}
