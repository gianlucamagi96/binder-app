import cv2
import numpy as np
import pytest

import recognizer.pipeline as pipeline
from recognizer.detect import CARD_HEIGHT, CARD_WIDTH
from recognizer.verify import (
    QUERY_FEATURES,
    REFERENCE_FEATURES,
    ReferenceFeatures,
    count_inliers,
    orb_features,
    save_features,
)
from tests.synthetic import fake_card, place
from tests.test_pipeline import MODEL, ThumbnailEmbedder

pytest.importorskip("faiss")
from recognizer.index import CardIndex, save_index  # noqa: E402


def reprint_of(card: np.ndarray, seed: int) -> np.ndarray:
    """Stessa illustrazione, metà inferiore diversa: come una ristampa con altro testo e numero."""
    reprint = card.copy()
    texture = np.random.default_rng(seed).integers(0, 255, (380, 520, 3), dtype=np.uint8)
    reprint[440:820, 55:575] = cv2.GaussianBlur(texture, (7, 7), 2)
    return reprint


def test_la_carta_giusta_allinea_piu_punti_della_ristampa():
    original = fake_card(0)
    reprint = reprint_of(original, 9)
    photo = place(reprint, [[300, 150], [810, 190], [850, 880], [270, 850]])
    crop = cv2.warpPerspective(
        photo,
        cv2.getPerspectiveTransform(
            np.float32([[300, 150], [810, 190], [850, 880], [270, 850]]),
            np.float32(
                [[0, 0], [CARD_WIDTH - 1, 0], [CARD_WIDTH - 1, CARD_HEIGHT - 1], [0, CARD_HEIGHT - 1]]
            ),
        ),
        (CARD_WIDTH, CARD_HEIGHT),
    )
    query = orb_features(crop, QUERY_FEATURES)

    right = count_inliers(query, orb_features(reprint, REFERENCE_FEATURES))
    wrong = count_inliers(query, orb_features(original, REFERENCE_FEATURES))

    assert right > wrong * 1.3


def test_feature_salvate_e_ricaricate_uguali(tmp_path):
    features = [orb_features(fake_card(seed), REFERENCE_FEATURES) for seed in range(3)]
    save_features(tmp_path, features)

    loaded = ReferenceFeatures.load(tmp_path)

    assert loaded is not None and loaded.rows == 3
    points, descriptors = loaded.get(1)
    assert np.array_equal(descriptors, features[1][1])
    assert np.abs(points - features[1][0]).max() < 0.5


def test_senza_file_niente_verifica(tmp_path):
    assert ReferenceFeatures.load(tmp_path) is None


def test_la_pipeline_riordina_le_ristampe(tmp_path, monkeypatch):
    original = fake_card(0)
    reprint = reprint_of(original, 9)
    cards = [original, reprint, fake_card(5)]
    meta = [
        {"card_id": card_id, "lang": "en", "set_id": card_id.split("-")[0], "local_id": "1"}
        for card_id in ("base1-1", "base4-1", "other-1")
    ]
    embedder = ThumbnailEmbedder()
    save_index(tmp_path, embedder.embed(cards), meta, MODEL, {})
    save_features(tmp_path, [orb_features(card, REFERENCE_FEATURES) for card in cards])
    index = CardIndex.load(tmp_path, MODEL)
    # Le miniature del test non rendono le ristampe vicine come DINOv2: verifichiamo comunque.
    monkeypatch.setattr(pipeline, "VERIFY_MARGIN", 1.0)
    recognizer = pipeline.Recognizer(embedder, index, top_k=3, references=ReferenceFeatures.load(tmp_path))

    for expected, card in (("base1-1", original), ("base4-1", reprint)):
        photo = place(card, [[300, 150], [810, 190], [850, 880], [270, 850]])
        detection = recognizer.identify(photo)[0]
        assert detection.candidates[0].card_id == expected
        assert detection.inliers[expected] >= pipeline.MIN_INLIERS
