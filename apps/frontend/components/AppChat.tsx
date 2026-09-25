"use client";

import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import type { FeaturedCard } from "@/lib/catalog";
import { Card } from "@/components/Card";
import { CardDetailModal } from "@/components/CardDetailModal";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

type PendingAction = {
  op: "add" | "remove";
  targetType: "binder" | "wishlist";
  targetId: string;
  targetName: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  cards?: FeaturedCard[];
  pending?: PendingAction | null;
};

export function AppChat() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Puoi cercare una carta, creare un binder o una wishlist, oppure chiedere di aggiungere o togliere una carta.",
    },
  ]);
  const [detail, setDetail] = useState<FeaturedCard | null>(null);

  async function send() {
    const message = draft.trim();
    if (!message || busy) return;
    const history = messages
      .filter((item) => item.role === "user" || item.content)
      .slice(-8)
      .map((item) => ({ role: item.role, content: item.content }));
    setMessages((current) => [...current, { role: "user", content: message }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message ?? "Chat non disponibile");
      }
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.reply ?? "",
          cards: data.cards ?? [],
          pending: data.pending ?? null,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Chat non disponibile",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function apply(pending: PendingAction, card: FeaturedCard) {
    setBusy(true);
    try {
      const res = await fetch("/api/chat/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: pending.op,
          targetType: pending.targetType,
          targetId: pending.targetId,
          cardId: card.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Operazione non riuscita");
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.reply ?? "Fatto." },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Operazione non riuscita",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <Panel
          elevated
          className="fixed bottom-24 right-4 z-40 flex h-[min(32rem,70dvh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden md:bottom-6"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-display text-sm font-semibold text-foreground">Assistente</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Chiudi chat"
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-foreground-muted hover:bg-surface-hover hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className="flex flex-col gap-2">
                <p
                  className={`max-w-[95%] rounded-[var(--radius-md)] px-3 py-2 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "ml-auto bg-accent text-accent-foreground"
                      : "bg-surface-hover text-foreground-secondary"
                  }`}
                >
                  {message.content}
                </p>
                {message.cards && message.cards.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {message.cards.map((card) => (
                      <div key={card.id} className="flex flex-col gap-1.5">
                        <Card card={card} onClick={() => setDetail(card)} />
                        {message.pending && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => apply(message.pending!, card)}
                          >
                            {message.pending.op === "add" ? "Aggiungi" : "Rimuovi"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <form
            className="flex items-center gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Chiedi una carta, un binder, una wishlist…"
              className="h-11 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-accent"
            />
            <Button type="submit" variant="ember" size="sm" disabled={busy || !draft.trim()} aria-label="Invia">
              <Send className="h-4 w-4" aria-hidden />
            </Button>
          </form>
        </Panel>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label="Apri assistente"
          className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-ember text-ember-foreground shadow-lg md:bottom-6"
        >
          <MessageCircle className="h-5 w-5" aria-hidden />
        </button>
      )}

      {detail && <CardDetailModal card={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
