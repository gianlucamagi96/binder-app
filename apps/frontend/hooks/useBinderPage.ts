"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BinderDetail, BinderSlot } from "@/lib/binders";
import { AFTER_PAGE_FLIP_MS, delay } from "@/lib/slot-insert";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; binder: BinderDetail };

// Centralizza fetch + paginazione di un binder: usato sia dalla pagina
// statica /binders/[id] sia dall'overlay animato aperto da /binders, così
// la logica di rete non è duplicata tra i due punti di accesso.
//
// Punto chiave per l'animazione di sfoglio: goTo() aspetta che i dati della
// pagina di destinazione siano arrivati PRIMA di aggiornare lo stato. Solo
// a quel punto pageNumber cambia, e solo allora AnimatePresence (nel
// componente di flip) vede una nuova key e fa scattare la rotazione. Questo
// evita di animare l'ingresso di una pagina ancora vuota/in caricamento.
export function useBinderPage(binderId: string) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [navigating, setNavigating] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const navigatingRef = useRef(false);

  const fetchPage = useCallback(
    async (pageNumber: number): Promise<BinderDetail> => {
      const res = await fetch(`/api/binders/${binderId}?page=${pageNumber}`);
      if (!res.ok) {
        throw new Error("Impossibile caricare la pagina del binder");
      }
      return res.json();
    },
    [binderId],
  );

  const load = useCallback(
    async (pageNumber: number) => {
      setState({ status: "loading" });
      try {
        const binder = await fetchPage(pageNumber);
        setState({ status: "ready", binder });
      } catch {
        setState({ status: "error" });
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    void load(1);
    // Ricarica da capo solo quando cambia il binder, non ad ogni render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binderId]);

  const goTo = useCallback(
    async (pageNumber: number) => {
      // Blocca chiamate concorrenti: frecce/swipe ripetuti in rapida
      // successione potrebbero altrimenti far partire due fetch verso
      // pagine diverse e il flip finirebbe per mostrare quella "sbagliata"
      // se le risposte arrivano fuori ordine.
      if (navigatingRef.current) return;

      const current = stateRef.current;
      if (current.status !== "ready") return;
      if (pageNumber < 1 || pageNumber > current.binder.totalPages) return;
      if (pageNumber === current.binder.page.pageNumber) return;

      navigatingRef.current = true;
      setNavigating(true);
      try {
        const binder = await fetchPage(pageNumber);
        setState({ status: "ready", binder });
      } catch {
        // Navigazione fallita: resta sulla pagina corrente invece di rompere la vista.
      } finally {
        navigatingRef.current = false;
        setNavigating(false);
      }
    },
    [fetchPage],
  );

  const goNext = useCallback(() => {
    const current = stateRef.current;
    if (current.status === "ready") {
      void goTo(current.binder.page.pageNumber + 1);
    }
  }, [goTo]);

  const goPrev = useCallback(() => {
    const current = stateRef.current;
    if (current.status === "ready") {
      void goTo(current.binder.page.pageNumber - 1);
    }
  }, [goTo]);

  const patchSlotLocal = useCallback((updated: BinderSlot) => {
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      return {
        status: "ready",
        binder: {
          ...prev.binder,
          page: {
            ...prev.binder.page,
            slots: prev.binder.page.slots.map((slot) =>
              slot.id === updated.id ? updated : slot,
            ),
          },
        },
      };
    });
  }, []);

  // Salva e restituisce lo slot aggiornato senza ricaricare la pagina:
  // il chiamante orchestra l'animazione di inserimento, poi applica il patch.
  const saveSlot = useCallback(
    async (
      slotId: string,
      input: { tcgdexCardId?: string | null; quantity?: number; condition?: string | null },
    ): Promise<BinderSlot> => {
      const res = await fetch(`/api/binders/${binderId}/slots/${slotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Errore durante il salvataggio");
      }
      return res.json();
    },
    [binderId],
  );

  // Trova il primo slot vuoto (senza carta) nel binder, sfogliando le pagine
  // in ordine. Se non è sulla pagina corrente, naviga lì e attende lo sfoglio.
  const goToFirstEmptySlot = useCallback(async (): Promise<{
    slot: BinderSlot;
    pageNumber: number;
  } | null> => {
    const current = stateRef.current;
    if (current.status !== "ready") return null;

    const localEmpty = current.binder.page.slots.find((slot) => !slot.tcgdexCardId);
    if (localEmpty) {
      return { slot: localEmpty, pageNumber: current.binder.page.pageNumber };
    }

    for (let pageNumber = 1; pageNumber <= current.binder.totalPages; pageNumber += 1) {
      if (pageNumber === current.binder.page.pageNumber) continue;

      const binder = await fetchPage(pageNumber);
      const empty = binder.page.slots.find((slot) => !slot.tcgdexCardId);
      if (!empty) continue;

      navigatingRef.current = true;
      setNavigating(true);
      try {
        setState({ status: "ready", binder });
      } finally {
        navigatingRef.current = false;
        setNavigating(false);
      }
      await delay(AFTER_PAGE_FLIP_MS);
      return { slot: empty, pageNumber };
    }

    return null;
  }, [fetchPage]);

  // Se lo slot target non è sulla pagina visibile (es. dopo uno sfoglio
  // mentre il modal era aperto), porta in vista la pagina che lo contiene.
  const revealSlotPage = useCallback(
    async (slotId: string) => {
      const current = stateRef.current;
      if (current.status !== "ready") return;
      if (current.binder.page.slots.some((slot) => slot.id === slotId)) return;

      for (let pageNumber = 1; pageNumber <= current.binder.totalPages; pageNumber += 1) {
        if (pageNumber === current.binder.page.pageNumber) continue;
        const binder = await fetchPage(pageNumber);
        if (!binder.page.slots.some((slot) => slot.id === slotId)) continue;

        navigatingRef.current = true;
        setNavigating(true);
        try {
          setState({ status: "ready", binder });
        } finally {
          navigatingRef.current = false;
          setNavigating(false);
        }
        await delay(AFTER_PAGE_FLIP_MS);
        return;
      }
    },
    [fetchPage],
  );

  const addPage = useCallback(async () => {
    // Riusa lo stesso guard/flag di navigazione: aggiungere una pagina
    // sposta comunque la vista sulla nuova ultima pagina, quindi deve
    // comportarsi come un "salto" e far scattare il flip come per goTo.
    if (navigatingRef.current) return;

    navigatingRef.current = true;
    setNavigating(true);
    try {
      const res = await fetch(`/api/binders/${binderId}/pages`, { method: "POST" });
      if (!res.ok) {
        throw new Error("Impossibile aggiungere la pagina");
      }
      const binder: BinderDetail = await res.json();
      setState({ status: "ready", binder });
    } catch {
      // Aggiunta fallita: resta sulla pagina corrente.
    } finally {
      navigatingRef.current = false;
      setNavigating(false);
    }
  }, [binderId]);

  const removeBinder = useCallback(async () => {
    await fetch(`/api/binders/${binderId}`, { method: "DELETE" });
  }, [binderId]);

  const reload = useCallback(() => {
    const current = stateRef.current;
    void load(current.status === "ready" ? current.binder.page.pageNumber : 1);
  }, [load]);

  return {
    state,
    navigating,
    goTo,
    goNext,
    goPrev,
    goToFirstEmptySlot,
    revealSlotPage,
    addPage,
    saveSlot,
    patchSlotLocal,
    removeBinder,
    reload,
  };
}
