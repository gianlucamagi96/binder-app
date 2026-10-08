import cv2
import numpy as np
import pytest

from recognizer.embed import normalize
from recognizer.index import CardIndex, Hit, best_per_card, save_index
from recognizer.pipeline import Recognizer
from tests.synthetic import fake_card, place

pytest.importorskip("faiss")

MODEL = "test/fake"


class ThumbnailEmbedder:
    """Al posto di DINOv2: miniatura 8x11 in grigio.

    Distingue le carte finte ed è sensibile alla rotazione, come serve ai test.
    """

    device = "cpu"

    def embed(self, cards: list[np.ndarray]) -> np.ndarray:
        rows = []
        for card in cards:
            gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
            small = cv2.resize(gray, (8, 11), interpolation=cv2.INTER_AREA).astype(np.float32).ravel()
            rows.append(small - small.mean())
        return normalize(np.stack(rows))


@pytest.fixture
def index(tmp_path):
    embedder = ThumbnailEmbedder()
    cards = [fake_card(seed) for seed in range(4)]
    meta = [
        {"card_id": f"set1-{seed}", "lang": "en", "set_id": "set1", "local_id": str(seed)}
        for seed in range(4)
    ]
    # La carta 0 c'è anche in italiano: deve restare un candidato solo.
    cards.append(fake_card(0))
    meta.append({"card_id": "set1-0", "lang": "it", "set_id": "set1", "local_id": "0"})
    save_index(tmp_path, embedder.embed(cards), meta, MODEL, {})
    return CardIndex.load(tmp_path, MODEL)


def test_riconosce_la_carta_fotografata(index):
    recognizer = Recognizer(ThumbnailEmbedder(), index, top_k=3)
    photo = place(fake_card(2), [[300, 150], [810, 190], [850, 880], [270, 850]])

    detections = recognizer.identify(photo)

    assert len(detections) == 1
    assert detections[0].detected
    assert detections[0].candidates[0].card_id == "set1-2"


def test_carta_capovolta_riconosciuta_lo_stesso(index):
    recognizer = Recognizer(ThumbnailEmbedder(), index, top_k=3)
    upside_down = cv2.rotate(fake_card(3), cv2.ROTATE_180)
    photo = place(upside_down, [[300, 150], [810, 150], [810, 860], [300, 860]])

    detections = recognizer.identify(photo)

    assert detections[0].candidates[0].card_id == "set1-3"


def test_stessa_carta_in_due_lingue_occupa_un_posto(index):
    recognizer = Recognizer(ThumbnailEmbedder(), index, top_k=5)
    photo = place(fake_card(0), [[300, 150], [810, 150], [810, 860], [300, 860]])

    candidates = recognizer.identify(photo)[0].candidates

    ids = [hit.card_id for hit in candidates]
    assert ids[0] == "set1-0"
    assert len(ids) == len(set(ids))


def test_indice_di_un_altro_modello_non_si_carica(tmp_path):
    save_index(
        tmp_path, normalize(np.eye(2, dtype=np.float32)), [{"card_id": "a"}, {"card_id": "b"}], "altro", {}
    )
    with pytest.raises(RuntimeError, match="ricostruiscilo"):
        CardIndex.load(tmp_path, MODEL)


def test_best_per_card_tiene_il_punteggio_migliore():
    hits = [Hit("a", "en", 0.7), Hit("b", "en", 0.8), Hit("a", "it", 0.9)]
    assert best_per_card(hits) == [Hit("a", "it", 0.9), Hit("b", "en", 0.8)]


def test_senza_contorni_sicuri_sceglie_l_ipotesi_piu_simile(index, monkeypatch):
    import recognizer.pipeline as pipeline
    from recognizer.detect import CardCrop

    background = np.random.default_rng(4).integers(0, 255, (880, 630, 3), dtype=np.uint8)
    quad = np.float32([[0, 0], [629, 0], [629, 879], [0, 879]])
    hypotheses = [
        CardCrop(background, quad, True, alternative=True),
        CardCrop(fake_card(1), quad, True, alternative=True),
        CardCrop(cv2.GaussianBlur(background, (51, 51), 20), quad, False, alternative=True),
    ]
    monkeypatch.setattr(pipeline, "extract_cards", lambda image: hypotheses)
    recognizer = Recognizer(ThumbnailEmbedder(), index, top_k=3)

    detections = recognizer.identify(np.zeros((100, 100, 3), np.uint8))

    assert len(detections) == 1
    assert detections[0].candidates[0].card_id == "set1-1"
