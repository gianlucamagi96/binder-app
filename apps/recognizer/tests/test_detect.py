import cv2
import numpy as np
import pytest

from recognizer.detect import (
    CARD_HEIGHT,
    CARD_WIDTH,
    box_percent,
    extract_cards,
    find_card_quads,
    order_corners,
    rotate_180,
)
from tests.synthetic import fake_card, place


def difference(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean(cv2.absdiff(a, b)))


def best_difference(crop: np.ndarray, card: np.ndarray) -> float:
    return min(difference(crop, card), difference(rotate_180(crop), card))


def test_raddrizza_una_carta_in_prospettiva():
    card = fake_card()
    corners = [[310, 160], [820, 210], [860, 880], [260, 840]]
    photo = place(card, corners)

    crops = [crop for crop in extract_cards(photo) if crop.detected]

    assert len(crops) == 1
    assert crops[0].image.shape == (CARD_HEIGHT, CARD_WIDTH, 3)
    assert np.abs(crops[0].quad - np.array(corners)).max() < 12
    assert difference(crops[0].image, card) < 18


def test_carta_sdraiata_esce_in_verticale():
    card = fake_card()
    # Carta ruotata di 90°: l'alto della carta è sul lato destro della foto.
    corners = [[1150, 150], [1150, 780], [250, 780], [250, 150]]
    photo = place(card, corners)

    crops = [crop for crop in extract_cards(photo) if crop.detected]

    assert len(crops) == 1
    assert crops[0].image.shape == (CARD_HEIGHT, CARD_WIDTH, 3)
    # Senza sapere dove sia l'alto resta il dubbio dei 180°: una delle due combacia.
    assert best_difference(crops[0].image, card) < 18


def test_carta_piccola_e_sola_si_prova_anche_la_foto_intera():
    # Potrebbe essere un pezzo della carta (illustrazione, box del testo) con il
    # bordo vero sul bordo del mirino: decide il riconoscimento.
    photo = place(fake_card(), [[400, 300], [800, 300], [800, 860], [400, 860]])

    crops = extract_cards(photo)

    assert [crop.detected for crop in crops] == [True, False]
    assert all(crop.alternative for crop in crops)


def test_carta_che_riempie_la_foto_non_raddoppia():
    photo = place(fake_card(), [[40, 40], [960, 40], [960, 1260], [40, 1260]], size=(1300, 1000))

    crops = extract_cards(photo)

    assert len(crops) == 1
    assert crops[0].detected and not crops[0].alternative


def test_carta_storta_di_45_gradi_non_viene_scartata():
    card = fake_card()
    center = np.array([650, 500])
    half = np.array([[-180, -250], [180, -250], [180, 250], [-180, 250]], dtype=np.float32)
    angle = np.deg2rad(45)
    rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    corners = (half @ rotation.T + center).tolist()

    quads = find_card_quads(place(card, corners))

    assert len(quads) == 1


def test_trova_piu_carte_e_non_scambia_l_illustrazione_per_una_carta():
    photo = place(fake_card(0), [[60, 120], [560, 120], [560, 820], [60, 820]])
    second = place(fake_card(1), [[700, 140], [1200, 140], [1200, 840], [700, 840]])
    photo[:, 650:] = second[:, 650:]

    quads = find_card_quads(photo)

    assert len(quads) == 2
    lefts = sorted(float(quad[:, 0].min()) for quad in quads)
    assert lefts[0] == pytest.approx(60, abs=12)
    assert lefts[1] == pytest.approx(700, abs=12)


def test_carta_tagliata_dal_bordo_della_foto():
    card = fake_card()
    # Il lato destro esce di poco dalla foto, come quando il mirino taglia la carta.
    corners = [[500, 200], [1300, 200], [1300, 1320], [500, 1320]]
    photo = place(card, corners, size=(1500, 1250))

    quads = find_card_quads(photo)

    assert len(quads) == 1
    assert quads[0][:, 0].min() == pytest.approx(500, abs=15)


def test_bordo_visibile_solo_nel_colore():
    card = fake_card()
    border = card[5, 5].astype(np.uint8)
    border_gray = int(cv2.cvtColor(border.reshape(1, 1, 3), cv2.COLOR_BGR2GRAY)[0, 0])
    # Sfondo viola con la stessa luminosità del bordo giallo: lo separa solo il colore.
    for blue in range(256):
        candidate = np.array([[[blue, 150, 230]]], dtype=np.uint8)
        if abs(int(cv2.cvtColor(candidate, cv2.COLOR_BGR2GRAY)[0, 0]) - border_gray) <= 2:
            break
    photo = place(card, [[300, 150], [810, 150], [810, 860], [300, 860]], color=(blue, 150, 230))

    assert len(find_card_quads(photo)) == 1


def test_senza_contorni_usa_la_foto_intera():
    photo = np.random.default_rng(3).integers(0, 255, (900, 640, 3), dtype=np.uint8)
    photo = cv2.GaussianBlur(photo, (31, 31), 10)

    crops = extract_cards(photo)

    assert len(crops) == 1
    assert not crops[0].detected
    assert crops[0].image.shape == (CARD_HEIGHT, CARD_WIDTH, 3)


def test_order_corners_parte_da_alto_sinistra_in_senso_orario():
    shuffled = np.array([[10, 90], [90, 10], [10, 10], [90, 90]], dtype=np.float32)
    assert order_corners(shuffled).tolist() == [[10, 10], [90, 10], [90, 90], [10, 90]]


def test_box_percent_in_percentuale_e_dentro_la_foto():
    quad = np.array([[-5, 20], [50, 20], [50, 120], [-5, 120]], dtype=np.float32)
    assert box_percent(quad, 100, 100) == {"x": 0.0, "y": 20.0, "width": 50.0, "height": 80.0}
