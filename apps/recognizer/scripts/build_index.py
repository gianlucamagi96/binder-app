"""Calcola embedding e feature ORB delle immagini di riferimento e scrive l'indice in data/index/.

Si lancia dopo download_refs.py, sul PC. Al server serve solo la cartella
dell'indice: le immagini di riferimento restano qui.

    python scripts/build_index.py
"""

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np

from recognizer.config import load_settings
from recognizer.embed import INPUT_HEIGHT, INPUT_WIDTH, Embedder
from recognizer.index import save_index
from recognizer.verify import REFERENCE_FEATURES, orb_features, save_features

BATCH = 32


def main() -> None:
    settings = load_settings()
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--refs-dir", type=Path, default=Path("data/refs"))
    parser.add_argument("--out", type=Path, default=settings.index_dir)
    args = parser.parse_args()

    catalog = json.loads((args.refs_dir / "cards.json").read_text("utf-8"))
    items = [
        (card_id, lang, args.refs_dir / relative, entry)
        for card_id, entry in sorted(catalog.items())
        for lang, relative in sorted(entry["files"].items())
    ]
    if not items:
        raise SystemExit("Nessuna immagine di riferimento: lancia prima scripts/download_refs.py")

    embedder = Embedder(settings.model_name, settings.device, settings.torch_threads)
    vectors: list[np.ndarray] = []
    features: list[tuple[np.ndarray, np.ndarray]] = []
    meta: list[dict] = []
    started = time.perf_counter()

    for start in range(0, len(items), BATCH):
        images, rows = [], []
        for card_id, lang, path, entry in items[start : start + BATCH]:
            image = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if image is None:
                print(f"  ! immagine illeggibile: {path}")
                continue
            images.append(image)
            features.append(orb_features(image, REFERENCE_FEATURES))
            rows.append(
                {
                    "card_id": card_id,
                    "lang": lang,
                    "set_id": entry["set_id"],
                    "local_id": entry["local_id"],
                    "name": entry["names"].get(lang) or next(iter(entry["names"].values()), ""),
                }
            )
        vectors.append(embedder.embed(images))
        meta.extend(rows)
        done = min(start + BATCH, len(items))
        elapsed = time.perf_counter() - started
        print(f"{done}/{len(items)}  {elapsed:.0f}s  ({elapsed / done * 1000:.0f} ms/immagine)", flush=True)

    save_index(
        args.out,
        np.concatenate(vectors),
        meta,
        settings.model_name,
        {
            "input": [INPUT_WIDTH, INPUT_HEIGHT],
            "langs": sorted({row["lang"] for row in meta}),
            "orb_features": REFERENCE_FEATURES,
        },
    )
    save_features(args.out, features)
    print(f"Indice scritto in {args.out}: {len(meta)} vettori")


if __name__ == "__main__":
    main()
