"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message ?? "Impossibile inviare le istruzioni");
      }
      setMessage(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile inviare le istruzioni");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-16">
      <main className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Password dimenticata
          </h1>
          <p className="text-sm leading-relaxed text-foreground-muted">
            Inserisci la tua email: se esiste un account associato, riceverai le istruzioni per
            reimpostare la password.
          </p>
        </div>

        <Panel elevated className="p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Email"
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {message && (
              <p className="rounded-[var(--radius-md)] bg-success-soft px-3 py-2 text-sm text-success">
                {message}
              </p>
            )}
            {error && (
              <p className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" disabled={submitting} className="mt-1 w-full">
              {submitting ? "Invio in corso..." : "Invia istruzioni"}
            </Button>
          </form>
        </Panel>

        <p className="text-sm text-foreground-muted">
          <Link href="/login" className="font-medium text-accent-text hover:underline">
            Torna al login
          </Link>
        </p>
      </main>
    </div>
  );
}
