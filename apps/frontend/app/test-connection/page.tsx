"use client";

import { useEffect, useState } from "react";

type HealthResponse = {
  status: string;
};

type State =
  | { phase: "loading" }
  | { phase: "success"; data: HealthResponse }
  | { phase: "error"; message: string };

const BACKEND_HEALTH_URL = "http://localhost:3001/health";

export default function TestConnectionPage() {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function checkConnection() {
      try {
        const res = await fetch(BACKEND_HEALTH_URL);
        if (!res.ok) {
          throw new Error(`Backend ha risposto con status ${res.status}`);
        }
        const data = (await res.json()) as HealthResponse;
        if (!cancelled) {
          setState({ phase: "success", data });
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "Errore sconosciuto durante la richiesta.";
          setState({
            phase: "error",
            message: `Impossibile contattare il backend su ${BACKEND_HEALTH_URL}. ${message}`,
          });
        }
      }
    }

    void checkConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-6 py-32 px-8 text-center">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Test connessione backend
        </h1>

        {state.phase === "loading" && (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Verifica in corso...
          </p>
        )}

        {state.phase === "success" && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-lg text-green-600 dark:text-green-400">
              Connessione riuscita
            </p>
            <pre className="rounded bg-black/[.06] px-4 py-2 font-mono text-sm text-black dark:bg-white/[.08] dark:text-zinc-50">
              {JSON.stringify(state.data, null, 2)}
            </pre>
          </div>
        )}

        {state.phase === "error" && (
          <p className="text-lg text-red-600 dark:text-red-400">
            {state.message}
          </p>
        )}
      </main>
    </div>
  );
}
