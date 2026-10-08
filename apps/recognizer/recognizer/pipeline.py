from dataclasses import dataclass, field

import numpy as np

from recognizer.detect import box_percent, extract_cards, rotate_180
from recognizer.index import CardIndex, Hit, best_per_card
from recognizer.verify import QUERY_FEATURES, ReferenceFeatures, count_inliers, orb_features

# Quanti vettori leggere dall'indice prima di raggruppare per carta: ogni carta
# può comparire due volte (en + it) e le ristampe si affollano in cima.
SEARCH_K = 40
# Senza verifica geometrica: sotto questo distacco tra primo e secondo la scelta non è sicura.
AMBIGUOUS_MARGIN = 0.03
# Si verificano solo i candidati vicini al primo: oltre, l'embedding basta.
VERIFY_MARGIN = 0.06
VERIFY_MAX = 4
# Sotto questi punti allineati la verifica non dice niente e resta l'ordine degli embedding.
MIN_INLIERS = 10
# Se il secondo allinea quasi quanto il primo, la scelta resta incerta.
AMBIGUOUS_INLIER_RATIO = 0.8


@dataclass(frozen=True)
class Detection:
    box: dict[str, float]
    candidates: list[Hit]
    ambiguous: bool
    detected: bool
    inliers: dict[str, int] = field(default_factory=dict)
    """Punti allineati per i candidati verificati, per carta."""


class Recognizer:
    def __init__(self, embedder, index: CardIndex, top_k: int, references: ReferenceFeatures | None = None):
        self.embedder = embedder
        self.index = index
        self.top_k = top_k
        self.references = references

    def identify(self, image: np.ndarray) -> list[Detection]:
        height, width = image.shape[:2]
        crops = extract_cards(image)
        # Dopo il raddrizzamento non sappiamo dove sia l'alto: cerchiamo entrambe
        # le rotazioni e per ogni carta teniamo il punteggio migliore.
        upright = [crop.image for crop in crops]
        vectors = self.embedder.embed(upright + [rotate_180(card) for card in upright])
        results = self.index.search(vectors, SEARCH_K)

        rankings = [
            best_per_card(results[position] + results[position + len(crops)])[: self.top_k]
            for position in range(len(crops))
        ]
        if crops and crops[0].alternative:
            # Ipotesi diverse per la stessa carta: vince il ritaglio che somiglia
            # di più a una carta dell'indice. Un pezzo di sfondo non somiglia a niente.
            best = max(range(len(crops)), key=lambda i: rankings[i][0].score if rankings[i] else -1.0)
            crops, rankings = [crops[best]], [rankings[best]]

        detections = []
        for crop, ranked in zip(crops, rankings, strict=True):
            ranked, ambiguous, inliers = self._verify(crop.image, ranked)
            detections.append(
                Detection(
                    box=box_percent(crop.quad, width, height),
                    candidates=ranked,
                    ambiguous=ambiguous,
                    detected=crop.detected,
                    inliers=inliers,
                )
            )
        return detections

    def _verify(self, card: np.ndarray, ranked: list[Hit]) -> tuple[list[Hit], bool, dict[str, int]]:
        if len(ranked) < 2:
            return ranked, False, {}
        if self.references is None:
            return ranked, ranked[0].score - ranked[1].score < AMBIGUOUS_MARGIN, {}
        close = [hit for hit in ranked[:VERIFY_MAX] if ranked[0].score - hit.score <= VERIFY_MARGIN]
        if len(close) < 2:
            return ranked, False, {}

        # ORB è invariante alla rotazione e l'omografia assorbe il verso: basta la carta com'è.
        query = orb_features(card, QUERY_FEATURES)
        inliers = {
            hit.card_id: max(
                (count_inliers(query, self.references.get(row)) for row in self.index.rows_for(hit.card_id)),
                default=0,
            )
            for hit in close
        }
        order = sorted(close, key=lambda hit: (inliers[hit.card_id], hit.score), reverse=True)
        best = inliers[order[0].card_id]
        if best < MIN_INLIERS:
            return ranked, True, inliers
        second = inliers[order[1].card_id]
        # close è l'inizio di ranked: in coda restano i candidati non verificati.
        return order + ranked[len(close) :], second >= best * AMBIGUOUS_INLIER_RATIO, inliers
