"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Token di reset mancante o non valido. Richiedi un nuovo link.");
      return;
    }
    if (newPassword.length < 8) {
      setError("La password deve avere almeno 8 caratteri");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Le password non coincidono");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message ?? "Impossibile aggiornare la password");
      }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile aggiornare la password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-16">
      <main className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Reimposta password
          </h1>
          <p className="text-sm text-foreground-muted">Scegli una nuova password per il tuo account.</p>
        </div>

        {!token && (
          <p className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
            Link non valido: manca il token di reset. Richiedine uno nuovo dalla pagina{" "}
            <Link href="/forgot-password" className="font-medium underline">
              password dimenticata
            </Link>
            .
          </p>
        )}

        <Panel elevated className="p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Nuova password"
              id="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              label="Conferma nuova password"
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {success && (
              <p className="rounded-[var(--radius-md)] bg-success-soft px-3 py-2 text-sm text-success">
                Password aggiornata, reindirizzamento al login...
              </p>
            )}
            {error && (
              <p className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
                {error}
              </p>
            )}

            <Button type="submit" variant="ember" disabled={submitting} className="mt-1 w-full">
              {submitting ? "Aggiornamento in corso..." : "Aggiorna password"}
            </Button>
          </form>
        </Panel>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center px-4">
          <Skeleton className="h-64 w-full max-w-md" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
