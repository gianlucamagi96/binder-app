import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

INDEX_FILE = "index.faiss"
META_FILE = "meta.json"
MANIFEST_FILE = "manifest.json"


class IndexMismatchError(RuntimeError):
    pass


@dataclass(frozen=True)
class Hit:
    card_id: str
    lang: str
    score: float


class CardIndex:
    """Indice FAISS esatto (prodotto scalare su vettori normalizzati = similarità coseno)."""

    def __init__(self, index, meta: list[dict], manifest: dict):
        self._index = index
        self.meta = meta
        self.manifest = manifest
        self._rows_by_card: dict[str, list[int]] = {}
        for row, item in enumerate(meta):
            self._rows_by_card.setdefault(item["card_id"], []).append(row)

    @property
    def size(self) -> int:
        return int(self._index.ntotal)

    def rows_for(self, card_id: str) -> list[int]:
        """Righe dell'indice della carta: una per lingua."""
        return self._rows_by_card.get(card_id, [])

    def info(self, card_id: str, lang: str) -> dict:
        """Metadati della carta nella lingua indicata (o nella prima disponibile)."""
        rows = self.rows_for(card_id)
        for row in rows:
            if self.meta[row]["lang"] == lang:
                return self.meta[row]
        return self.meta[rows[0]] if rows else {}

    @classmethod
    def load(cls, directory: Path, expected_model: str) -> "CardIndex":
        import faiss

        manifest = json.loads((directory / MANIFEST_FILE).read_text("utf-8"))
        if manifest.get("model") != expected_model:
            raise IndexMismatchError(
                f"Indice costruito con {manifest.get('model')}, il servizio usa {expected_model}: "
                "ricostruiscilo con scripts/build_index.py"
            )
        index = faiss.read_index(str(directory / INDEX_FILE))
        meta = json.loads((directory / META_FILE).read_text("utf-8"))
        if index.ntotal != len(meta):
            raise IndexMismatchError(f"Indice con {index.ntotal} vettori ma {len(meta)} righe di metadati")
        return cls(index, meta, manifest)

    def search(self, vectors: np.ndarray, k: int) -> list[list[Hit]]:
        k = min(k, self.size)
        if k <= 0 or len(vectors) == 0:
            return [[] for _ in range(len(vectors))]
        scores, rows = self._index.search(np.ascontiguousarray(vectors, dtype=np.float32), k)
        return [
            [
                Hit(self.meta[row]["card_id"], self.meta[row]["lang"], float(score))
                for score, row in zip(score_row, row_row, strict=True)
                if row >= 0
            ]
            for score_row, row_row in zip(scores, rows, strict=True)
        ]


def best_per_card(hits: list[Hit]) -> list[Hit]:
    """La stessa carta in inglese e in italiano occupa un posto solo, col punteggio migliore."""
    best: dict[str, Hit] = {}
    for hit in hits:
        current = best.get(hit.card_id)
        if current is None or hit.score > current.score:
            best[hit.card_id] = hit
    return sorted(best.values(), key=lambda hit: hit.score, reverse=True)


def save_index(directory: Path, vectors: np.ndarray, meta: list[dict], model: str, extra: dict) -> None:
    import faiss

    if len(vectors) != len(meta):
        raise ValueError("vettori e metadati di lunghezza diversa")
    directory.mkdir(parents=True, exist_ok=True)
    index = faiss.IndexFlatIP(vectors.shape[1])
    index.add(np.ascontiguousarray(vectors, dtype=np.float32))
    faiss.write_index(index, str(directory / INDEX_FILE))
    (directory / META_FILE).write_text(json.dumps(meta, ensure_ascii=False), "utf-8")
    manifest = {
        "model": model,
        "dim": int(vectors.shape[1]),
        "count": len(meta),
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        **extra,
    }
    (directory / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2), "utf-8")
