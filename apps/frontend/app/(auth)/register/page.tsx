"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { postLoginRedirect } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri");
      return;
    }
    if (password !== confirmPassword) {
      setError("Le password non coincidono");
      return;
    }

    setSubmitting(true);
    try {
      const user = await register({ email, username, password });
      router.push(postLoginRedirect(user));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile completare la registrazione");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-16">
      <main className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2 text-center sm:text-left">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Crea un account
          </h1>
          <p className="text-sm text-foreground-muted">
            Inizia a organizzare la tua collezione TCG in pochi secondi.
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
            <Input
              label="Username"
              id="username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Input
              label="Password"
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              label="Conferma password"
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {error && (
              <p className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
                {error}
              </p>
            )}

            <Button type="submit" variant="ember" disabled={submitting} className="mt-1 w-full">
              {submitting ? "Registrazione in corso..." : "Registrati"}
            </Button>
          </form>
        </Panel>

        <p className="text-center text-sm text-foreground-muted sm:text-left">
          Hai già un account?{" "}
          <Link href="/login" className="font-medium text-accent-text hover:underline">
            Accedi
          </Link>
        </p>
      </main>
    </div>
  );
}
