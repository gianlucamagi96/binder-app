"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import { BookMarked, Plus } from "lucide-react";
import type { BinderListItem } from "@/lib/binders";
import { BinderTile } from "@/components/BinderTile";
import { BinderOverlay } from "@/components/BinderOverlay";
import { BinderViewToggle } from "@/components/BinderViewToggle";
import { PageContainer, PageHeader } from "@/components/PageContainer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBinderViewPreference } from "@/hooks/useBinderViewPreference";
import { useOpenBinder } from "@/hooks/useOpenBinder";

const BinderLibrary = dynamic(
  () => import("@/components/BinderLibrary").then((mod) => mod.BinderLibrary),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[min(68dvh,640px)] min-h-[22rem] w-full" />,
  },
);

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; binders: BinderListItem[] };

export default function BindersPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const { view, setView, ready: viewReady, libraryBlocked } = useBinderViewPreference();

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/binders")
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((binders: BinderListItem[]) => setState({ status: "ready", binders }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { binder: openBinder, open, close } = useOpenBinder(load);

  return (
    <PageContainer className="gap-8">
      <PageHeader
        eyebrow="La tua collezione"
        title="I miei binder"
        description="Apri un raccoglitore per sfogliare le pagine e aggiornare gli slot."
        action={
          <>
            <BinderViewToggle view={view} onChange={setView} />
            <Button href="/binders/new" variant="ember">
              <Plus className="h-4 w-4" aria-hidden />
              Nuovo binder
            </Button>
          </>
        }
      />

      {libraryBlocked && (
        <p role="status" className="text-sm text-foreground-muted">
          Vista libreria non disponibile su questo dispositivo
        </p>
      )}

      {state.status === "loading" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full sm:h-52" />
            ))}
          </div>
      )}

      {state.status === "error" && (
        <EmptyState
          tone="error"
          title="Impossibile caricare i binder"
          action={
            <Button variant="secondary" onClick={load}>
              Riprova
            </Button>
          }
        />
      )}

      {state.status === "ready" && state.binders.length === 0 && (
        <EmptyState
          icon={<BookMarked className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
          title="Il tuo primo raccoglitore ti aspetta"
          description="Crea un binder per un'espansione, per un gioco o completamente libero — poi riempilo carta per carta."
          action={
            <Button href="/binders/new" variant="ember">
              Crea il tuo primo binder
            </Button>
          }
        />
      )}

      {state.status === "ready" && state.binders.length > 0 && !viewReady && (
        <Skeleton className="h-[min(68dvh,640px)] min-h-[22rem] w-full" />
      )}

      {state.status === "ready" && state.binders.length > 0 && viewReady && view === "grid" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
          {state.binders.map((binder) => (
            <BinderTile
              key={binder.id}
              binder={binder}
              hidden={openBinder?.id === binder.id}
              onOpen={() => open(binder)}
            />
          ))}
        </div>
      )}

      {state.status === "ready" && state.binders.length > 0 && viewReady && view === "library" && (
        <BinderLibrary binders={state.binders} onOpen={open} />
      )}

      <AnimatePresence>
        {openBinder && <BinderOverlay binder={openBinder} onClose={close} />}
      </AnimatePresence>
    </PageContainer>
  );
}
