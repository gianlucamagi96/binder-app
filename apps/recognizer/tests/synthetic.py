import cv2
import numpy as np

from recognizer.detect import CARD_HEIGHT, CARD_WIDTH


def fake_card(seed: int = 0) -> np.ndarray:
    """Carta finta: bordo giallo, riquadro illustrazione e qualche riga di testo."""
    rng = np.random.default_rng(seed)
    card = np.full((CARD_HEIGHT, CARD_WIDTH, 3), (40, 200, 230), dtype=np.uint8)
    cv2.rectangle(card, (30, 30), (CARD_WIDTH - 31, CARD_HEIGHT - 31), (235, 235, 235), -1)
    art = rng.integers(0, 255, (300, 520, 3), dtype=np.uint8)
    card[110:410, 55:575] = cv2.GaussianBlur(art, (9, 9), 3)
    cv2.rectangle(card, (55, 110), (574, 409), (20, 20, 20), 4)
    for row in range(5):
        y = 470 + row * 70
        cv2.line(card, (70, y), (int(rng.integers(250, 560)), y), (30, 30, 30), 6)
    return card


def place(
    card: np.ndarray,
    corners: list[list[float]],
    size: tuple[int, int] = (1000, 1300),
    color: tuple[int, int, int] = (55, 55, 55),
) -> np.ndarray:
    """Proietta la carta su uno sfondo (BGR) nei quattro angoli dati (alto-sx in senso orario)."""
    height, width = size
    background = np.full((height, width, 3), color, dtype=np.uint8)
    noise = np.random.default_rng(1).integers(0, 18, background.shape, dtype=np.uint8)
    background = cv2.add(background, noise)
    source = np.array(
        [[0, 0], [CARD_WIDTH - 1, 0], [CARD_WIDTH - 1, CARD_HEIGHT - 1], [0, CARD_HEIGHT - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(source, np.array(corners, dtype=np.float32))
    warped = cv2.warpPerspective(card, matrix, (width, height))
    mask = cv2.warpPerspective(np.full(card.shape[:2], 255, np.uint8), matrix, (width, height))
    background[mask > 0] = warped[mask > 0]
    return background
