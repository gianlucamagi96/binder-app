# recognizer

Riconosce le carte Pokémon in una foto senza API esterne:

1. trova i contorni delle carte e le raddrizza (OpenCV);
2. calcola un embedding DINOv2 di ogni carta (CPU);
3. cerca le carte più simili in un indice FAISS di immagini ufficiali TCGdex, in inglese e in italiano;
4. se i primi candidati sono vicini (tipicamente ristampe con la stessa illustrazione), li riordina con una verifica geometrica ORB + RANSAC sull'intera carta.

Il backend Nest lo chiama su `POST /identify`; non è esposto all'esterno.

## Ambiente

```sh
python -m venv .venv
.venv/Scripts/python -m pip install --index-url https://download.pytorch.org/whl/cpu torch
.venv/Scripts/python -m pip install -e ".[ml,service,scripts,dev]"
```

Per i soli test di geometria basta `pip install -e ".[dev]"`.

## Indice (offline, sul PC)

```sh
# Immagini di riferimento in data/refs/ (incrementale: rilancialo per i set nuovi)
.venv/Scripts/python scripts/download_refs.py --sets base1 base4 sv03.5
.venv/Scripts/python scripts/download_refs.py              # tutti i set

# Embedding, feature ORB e indice in data/index/
.venv/Scripts/python scripts/build_index.py
```

Al server serve solo `data/index/`. Se cambi `MODEL_NAME`, l'indice va ricostruito: il servizio si rifiuta di partire con un indice di un altro modello.

## Servizio

```sh
.venv/Scripts/python -m uvicorn recognizer.app:app --port 8000
curl -F photo=@carta.jpg localhost:8000/identify
```

Con Docker, dalla root del repository (l'indice va costruito prima, sul PC):

```sh
docker compose up -d recognizer
curl localhost:8000/health
```

L'immagine contiene torch CPU e il modello già scaricato, così a runtime non scarica nulla. L'indice invece non è nell'immagine: compose monta `apps/recognizer/data/index` in `/index` in sola lettura. Per aggiornare l'indice basta ricostruirlo e riavviare il container.

| Variabile | Default | |
|---|---|---|
| `INDEX_DIR` | `data/index` | cartella dell'indice |
| `MODEL_NAME` | `facebook/dinov2-small` | modello Hugging Face |
| `DEVICE` | `cpu` | `cuda` se c'è una GPU |
| `TOP_K` | `5` | candidati per carta |
| `TORCH_THREADS` | `0` | 0 = un thread per core |

## Valutazione

Ogni cartella di valutazione ha un `labels.csv` con `file,card_id,tags` (tag separati da `;`).

```sh
# Foto sintetiche dalle immagini di riferimento (prospettiva, riflessi, sleeve, sfocatura…)
.venv/Scripts/python eval/synth.py --count 300
.venv/Scripts/python eval/run.py eval/synthetic --misses

# Inquadratura del mirino dell'app (carta che riempie la foto), il caso della fotocamera
.venv/Scripts/python eval/synth.py --count 500 --framing viewfinder --out eval/synthetic-viewfinder

# Solo il rilevamento dei contorni (le foto sintetiche hanno gli angoli veri)
.venv/Scripts/python eval/detect.py eval/synthetic --wrong

# Foto reali: mettile in eval/photos/ con il loro labels.csv
.venv/Scripts/python eval/run.py eval/photos --misses
```

`run.py` stampa top-1 / top-5 in totale e per tag, i contorni trovati, la latenza e gli errori da ristampa, e salva un report JSON in `eval/reports/`. Le foto e i report non vanno in git.

## Test

```sh
.venv/Scripts/python -m pytest          # esclude i test marcati slow
.venv/Scripts/python -m ruff check .
```
