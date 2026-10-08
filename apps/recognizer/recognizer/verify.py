"""Verifica geometrica tra la carta fotografata e le immagini di riferimento.

Due ristampe con la stessa illustrazione hanno embedding quasi identici, ma
differiscono nell'impaginazione del testo, nel numero, nel simbolo del set e nei
timbri. Con punti ORB e un'omografia RANSAC, la carta giusta allinea molti più
punti in modo coerente. Le scansioni ufficiali non sono allineate tra loro,
quindi un confronto pixel per pixel non funzionerebbe.
"""

from pathlib import Path

import cv2
import numpy as np

from recognizer.detect import CARD_HEIGHT, CARD_WIDTH

POINTS_FILE = "orb_points.npy"
DESCRIPTORS_FILE = "orb_descriptors.npy"
OFFSETS_FILE = "orb_offsets.npy"

QUERY_FEATURES = 1500
# Sui riferimenti 300 punti danno la stessa accuratezza di 1500 e occupano ~11 KB a immagine.
REFERENCE_FEATURES = 300
RATIO = 0.8
RANSAC_PIXELS = 6.0
MIN_MATCHES = 8

_clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))


def orb_features(card: np.ndarray, count: int) -> tuple[np.ndarray, np.ndarray]:
    """Punti (float32 Nx2) e descrittori (uint8 Nx32) sulla carta portata a 630x880."""
    resized = cv2.resize(card, (CARD_WIDTH, CARD_HEIGHT), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY) if resized.ndim == 3 else resized
    # CLAHE attenua le differenze di luce tra la foto e la scansione ufficiale.
    keypoints, descriptors = cv2.ORB_create(count).detectAndCompute(_clahe.apply(gray), None)
    if descriptors is None:
        return np.zeros((0, 2), np.float32), np.zeros((0, 32), np.uint8)
    return np.float32([point.pt for point in keypoints]), descriptors


def count_inliers(query: tuple[np.ndarray, np.ndarray], reference: tuple[np.ndarray, np.ndarray]) -> int:
    query_points, query_descriptors = query
    reference_points, reference_descriptors = reference
    if len(query_descriptors) < MIN_MATCHES or len(reference_descriptors) < MIN_MATCHES:
        return 0
    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(query_descriptors, reference_descriptors, k=2)
    good = [pair[0] for pair in pairs if len(pair) == 2 and pair[0].distance < RATIO * pair[1].distance]
    if len(good) < MIN_MATCHES:
        return 0
    source = query_points[[match.queryIdx for match in good]]
    target = reference_points[[match.trainIdx for match in good]].astype(np.float32)
    _, mask = cv2.findHomography(source, target, cv2.RANSAC, RANSAC_PIXELS)
    return int(mask.sum()) if mask is not None else 0


class ReferenceFeatures:
    """Feature ORB delle immagini di riferimento, una riga per vettore dell'indice."""

    def __init__(self, points: np.ndarray, descriptors: np.ndarray, offsets: np.ndarray):
        self._points = points
        self._descriptors = descriptors
        self._offsets = offsets

    @property
    def rows(self) -> int:
        return len(self._offsets) - 1

    def get(self, row: int) -> tuple[np.ndarray, np.ndarray]:
        start, end = int(self._offsets[row]), int(self._offsets[row + 1])
        return np.asarray(self._points[start:end], dtype=np.float32), np.asarray(self._descriptors[start:end])

    @classmethod
    def load(cls, directory: Path) -> "ReferenceFeatures | None":
        paths = [directory / name for name in (POINTS_FILE, DESCRIPTORS_FILE, OFFSETS_FILE)]
        if not all(path.exists() for path in paths):
            return None
        # Memory-map: le feature restano su disco, si legge solo quello che si confronta.
        points, descriptors, offsets = (np.load(path, mmap_mode="r") for path in paths)
        return cls(points, descriptors, np.asarray(offsets))


def save_features(directory: Path, features: list[tuple[np.ndarray, np.ndarray]]) -> None:
    offsets = np.zeros(len(features) + 1, dtype=np.int64)
    offsets[1:] = np.cumsum([len(descriptors) for _, descriptors in features])
    points = np.concatenate([points for points, _ in features]) if features else np.zeros((0, 2))
    descriptors = np.concatenate([d for _, d in features]) if features else np.zeros((0, 32))
    directory.mkdir(parents=True, exist_ok=True)
    # float16 basta: le coordinate stanno sotto 880 px, l'errore è sotto il pixel.
    np.save(directory / POINTS_FILE, points.astype(np.float16))
    np.save(directory / DESCRIPTORS_FILE, descriptors.astype(np.uint8))
    np.save(directory / OFFSETS_FILE, offsets)
