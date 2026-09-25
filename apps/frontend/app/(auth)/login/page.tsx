"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { API_URL, postLoginRedirect } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login({ email, password });
      router.push(postLoginRedirect(user));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile contattare il server, riprova");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-16">
      <main className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2 text-center sm:text-left">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Accedi
          </h1>
          <p className="text-sm text-foreground-muted">
            Entra nel tuo album digitale e continua la collezione.
          </p>
        </div>

        <Panel elevated className="flex flex-col gap-5 p-5 sm:p-6">
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
            <Input
              label="Password"
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <p className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
                {error}
              </p>
            )}

            <Button type="submit" variant="ember" disabled={submitting} className="mt-1 w-full">
              {submitting ? "Accesso in corso..." : "Accedi"}
            </Button>
          </form>

          <div className="relative flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-foreground-muted">oppure</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button href={`${API_URL}/auth/google`} variant="secondary" className="w-full">
            Accedi con Google
          </Button>
        </Panel>

        <div className="flex flex-col gap-1.5 text-center text-sm text-foreground-muted sm:text-left">
          <p>
            Non hai un account?{" "}
            <Link href="/register" className="font-medium text-accent-text hover:underline">
              Registrati
            </Link>
          </p>
          <p>
            <Link href="/forgot-password" className="font-medium text-accent-text hover:underline">
              Password dimenticata?
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
