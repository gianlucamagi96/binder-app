# Roadmap

Stato al 22 novembre 2026. Le voci "Da fare" sono proposte da validare, non impegni.

## Completato

### Fondamenta
- [x] Struttura monorepo (`frontend` Next.js, `backend` NestJS, `recognizer` Python) e `docker-compose` con Postgres, Redis e recognizer
- [x] Health endpoint
- [x] CI con lint e test; rimosso il codice morto dell'OCR

### Funzioni principali
- [x] Autenticazione, catalogo (TCGdex), binder e wishlist
- [x] Dashboard e navigazione per pagine del binder
- [x] Catalogo: in evidenza solo i set con artwork

### Sicurezza account
- [x] Sessioni per dispositivo
- [x] Login Google con codice monouso
- [x] Rate limiting (Redis)
- [x] Email di reset password via SMTP

### Scansione carte
- [x] Fotocamera a tutto schermo con mirino, torcia e zoom
- [x] Scatto del solo riquadro nel mirino
- [x] Revisione del match prima dell'inserimento nel binder
- [x] Riconoscimento self-hosted: embedding DINOv2, indice FAISS, verifica ORB delle ristampe (sostituisce Groq)

### Catalogo
- [x] Esclusione di Pokémon TCG Pocket (carte solo digitali) da catalogo, binder e wishlist, con script di pulizia dei dati esistenti

## In corso / Prossimi passi immediati

- [ ] Eseguire `scripts/remove-pocket-cards.js` sul database reale e verificare che non restino carte Pocket
- [ ] Unire il branch `riconoscimento-self-hosted` in `main` dopo verifica di lint, test e build
- [ ] Normalizzare i fine riga (`.gitattributes`, `core.autocrlf`): ogni commit segnala avvisi LF/CRLF
- [ ] Aggiornare il README: descrivere `recognizer`, avvio locale e variabili d'ambiente

## Breve termine

### Qualità del riconoscimento
- [ ] Misurare accuratezza e latenza con il set in `apps/recognizer/eval` e fissare soglie minime
- [ ] Gestire i casi a bassa confidenza: mostrare i primi N candidati invece di un solo match
- [ ] Rigenerare l'indice FAISS quando escono nuovi set, con uno script ripetibile

### Affidabilità
- [ ] Test end to end del flusso scansione → revisione → binder
- [ ] Gestione errori e timeout del servizio recognizer lato backend, con messaggi chiari all'utente
- [ ] Healthcheck del recognizer in `docker-compose`
- [ ] Test sul filtro Pocket anche per il caso in cui TCGdex non risponda (elenco di riserva)

### Esperienza d'uso
- [ ] Verifica su dispositivi mobili reali (fotocamera, torcia, zoom variano per browser)
- [ ] Scansione di più carte in sequenza senza uscire dalla fotocamera

## Medio termine

- [ ] Prezzi e valore della collezione (fonte da scegliere)
- [ ] Statistiche in dashboard: completamento per set, carte mancanti
- [ ] Condizione, lingua e variante (holo, reverse) per ogni carta nel binder
- [ ] Wishlist: confronto con il binder e segnalazione di cosa manca
- [ ] Esportazione e importazione della collezione (CSV)
- [ ] Supporto ad altri giochi di carte (esiste già il modulo `tcg-games`)

## Lungo termine

- [ ] Condivisione di binder e wishlist tramite link pubblico
- [ ] Scambi tra utenti
- [ ] App installabile (PWA) con uso offline della collezione
- [ ] Deploy in produzione: hosting del recognizer, monitoraggio, backup del database

## Debito tecnico da tenere d'occhio

- Il modulo `chat` nel backend: verificare se serve ancora dopo la rimozione di Groq
- Dipendenza dall'API TCGdex: valutare una cache locale del catalogo
- Indice FAISS costruito a mano sul PC e montato in sola lettura: automatizzare la pubblicazione
