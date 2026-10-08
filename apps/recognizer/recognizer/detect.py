from dataclasses import dataclass

import cv2
import numpy as np

# Una carta è 63x88 mm: la raddrizziamo sempre a questa proporzione.
CARD_WIDTH = 630
CARD_HEIGHT = 880

# Parte dagli stessi filtri del tracker nel browser (apps/frontend/lib/scan/opencv-track.ts),
# ma qui il ritaglio decide il riconoscimento: bordi anche di colore, inviluppo
# convesso e verifica che i lati poggino davvero sui bordi. Il rapporto si misura
# sui lati del quadrilatero, così una carta storta non viene scartata.
ANALYSIS_EDGE = 640
MIN_AREA_RATIO = 0.03
MAX_AREA_RATIO = 0.98
MIN_ASPECT = 0.58
MAX_ASPECT = 0.86
MAX_CARDS = 8
MAX_IOU = 0.45
# Il riquadro dell'illustrazione ha quasi la proporzione di una carta: se un
# quadrilatero sta per lo più dentro uno più grande, è un pezzo di quella carta.
MAX_CONTAINED = 0.6
# Ogni lato del quadrilatero deve poggiare su un bordo rilevato per almeno
# questa frazione della sua lunghezza (riflessi e sleeve ne cancellano un po').
MIN_EDGE_SUPPORT = 0.5
# ...e più delle sue parallele vicine: su uno sfondo pieno di texture ogni linea
# poggia su qualche bordo. Misure a ANALYSIS_EDGE px.
MIN_EDGE_CONTRAST = 0.15
SHIFT_PIXELS = 12
# Quadrilateri scartati solo per il contrasto: senza contorni sicuri si provano
# come ipotesi insieme alla foto intera, e sceglie il riconoscimento.
MAX_HYPOTHESES = 2
# Un solo contorno sicuro ma piccolo può essere un pezzo della carta (illustrazione,
# box del testo) mentre il bordo vero coincide col bordo del mirino: si prova
# anche la foto intera e sceglie il riconoscimento.
SMALL_SINGLE_CARD = 0.6


@dataclass(frozen=True)
class CardCrop:
    image: np.ndarray
    """Carta raddrizzata, BGR, CARD_HEIGHT x CARD_WIDTH."""
    quad: np.ndarray
    """Angoli nella foto originale: alto-sx, alto-dx, basso-dx, basso-sx."""
    detected: bool
    """False quando non c'erano contorni e si usa la foto intera."""
    alternative: bool = False
    """True se è una di più ipotesi per la stessa carta: se ne tiene una sola."""


def extract_cards(image: np.ndarray) -> list[CardCrop]:
    sure, weak = find_card_candidates(image)
    height, width = image.shape[:2]
    whole = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype=np.float32)
    if len(sure) == 1 and cv2.contourArea(sure[0]) < SMALL_SINGLE_CARD * width * height:
        return [
            CardCrop(warp_card(image, sure[0]), sure[0], True, alternative=True),
            CardCrop(warp_card(image, whole), whole, False, alternative=True),
        ]
    if sure:
        return [CardCrop(warp_card(image, quad), quad, True) for quad in sure]
    # La foto arriva già ritagliata sul mirino: senza contorni sicuri è una
    # carta sola, e la foto intera è sempre tra le ipotesi.
    crops = [CardCrop(warp_card(image, quad), quad, True, alternative=True) for quad in weak]
    return [*crops, CardCrop(warp_card(image, whole), whole, False, alternative=bool(crops))]


def find_card_quads(image: np.ndarray) -> list[np.ndarray]:
    return find_card_candidates(image)[0]


def find_card_candidates(image: np.ndarray) -> tuple[list[np.ndarray], list[np.ndarray]]:
    """Quadrilateri sicuri e, a parte, quelli che poggiano sui bordi ma con poco contrasto."""
    height, width = image.shape[:2]
    if width < 2 or height < 2:
        return [], []
    scale = min(1.0, ANALYSIS_EDGE / max(width, height))
    small = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    edges = edge_map(small)
    # Tolleranza di ±4 px (vertici imprecisi, sfocatura) per verificare che i lati poggino sui bordi.
    support = cv2.dilate(edges, np.ones((9, 9), np.uint8))
    # Una carta tagliata dal mirino non ha bordo dove esce dalla foto: lì il
    # margine dell'immagine fa da bordo.
    support[:4] = support[-4:] = 255
    support[:, :4] = support[:, -4:] = 255
    # Il bordo della carta si spezza dove l'illustrazione lo tocca o il contrasto
    # cala: la chiusura riunisce i pezzi vicini.
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    contours, _ = cv2.findContours(closed, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    frame_area = small.shape[0] * small.shape[1]
    quads: list[np.ndarray] = []
    weak: list[np.ndarray] = []
    for contour in contours:
        if cv2.arcLength(contour, True) < 80:
            continue
        # L'inviluppo convesso ignora i pezzi di illustrazione attaccati al bordo.
        hull = cv2.convexHull(contour)
        area = cv2.contourArea(hull)
        if area < frame_area * MIN_AREA_RATIO or area > frame_area * MAX_AREA_RATIO:
            continue
        corners = quad_from_hull(hull)
        if corners is None:
            continue
        quad = order_corners(corners.astype(np.float32))
        ratio = side_ratio(quad)
        if ratio < MIN_ASPECT or ratio > MAX_ASPECT:
            continue
        # Un frammento o un blob fuso con lo sfondo dà un quadrilatero i cui lati
        # non stanno sui bordi: meglio nessun contorno che un ritaglio sbagliato.
        on_edges, contrast = edge_support(support, quad)
        if on_edges < MIN_EDGE_SUPPORT:
            continue
        (quads if contrast >= MIN_EDGE_CONTRAST else weak).append(quad / scale)
    sure = suppress_overlaps(quads)
    return sure, [] if sure else suppress_overlaps(weak)[:MAX_HYPOTHESES]


def edge_map(image: np.ndarray) -> np.ndarray:
    """Bordi di luminosità e di colore.

    Un bordo giallo su uno sfondo ugualmente chiaro si vede solo nel colore.
    """
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    lightness, green_red, blue_yellow = cv2.split(cv2.cvtColor(image, cv2.COLOR_BGR2LAB))
    edges = cv2.Canny(cv2.GaussianBlur(lightness, (5, 5), 1.2), 30, 90)
    for channel in (green_red, blue_yellow):
        edges |= cv2.Canny(cv2.GaussianBlur(channel, (5, 5), 1.2), 12, 36)
    return edges


def quad_from_hull(hull: np.ndarray) -> np.ndarray | None:
    perimeter = cv2.arcLength(hull, True)
    for epsilon in (0.02, 0.03, 0.045, 0.06, 0.08):
        approx = cv2.approxPolyDP(hull, epsilon * perimeter, True)
        if len(approx) == 4:
            return approx.reshape(4, 2)
        if len(approx) < 4:
            break
    # Angoli arrotondati o tagliati: il rettangolo minimo, purché l'inviluppo lo riempia.
    rect = cv2.minAreaRect(hull)
    rect_area = rect[1][0] * rect[1][1]
    if rect_area > 0 and cv2.contourArea(hull) / rect_area > 0.9:
        return cv2.boxPoints(rect)
    return None


def edge_support(support: np.ndarray, quad: np.ndarray) -> tuple[float, float]:
    """Supporto e contrasto del lato peggiore.

    Supporto: frazione del lato che cade su un bordo rilevato. Contrasto: quanto
    il lato è più supportato della più quieta tra le due parallele spostate di
    SHIFT_PIXELS verso l'interno e verso l'esterno. Sul bordo vero di una carta
    almeno un lato è quieto (il bordo della carta o il tavolo); in una zona piena
    di texture ogni linea e le sue parallele sono supportate allo stesso modo.
    """
    worst_support = 1.0
    worst_contrast = 1.0
    for start, end in zip(quad, np.roll(quad, -1, axis=0), strict=True):
        direction = (end - start) / max(float(np.linalg.norm(end - start)), 1e-6)
        # Con gli angoli in senso orario (y verso il basso) l'interno è a destra del lato.
        inward = np.array([-direction[1], direction[0]]) * SHIFT_PIXELS
        on_line = _line_support(support, start, end)
        inner = _line_support(support, start + inward, end + inward)
        outer = _line_support(support, start - inward, end - inward)
        worst_support = min(worst_support, on_line)
        worst_contrast = min(worst_contrast, on_line - min(inner, outer))
    return worst_support, worst_contrast


def _line_support(support: np.ndarray, start: np.ndarray, end: np.ndarray, samples: int = 60) -> float:
    height, width = support.shape[:2]
    steps = np.linspace(0.05, 0.95, samples)[:, None]
    points = np.rint(start + (end - start) * steps).astype(int)
    inside = (points[:, 0] >= 0) & (points[:, 0] < width) & (points[:, 1] >= 0) & (points[:, 1] < height)
    if not inside.any():
        return 0.0
    # I punti fuori dalla foto contano come non supportati.
    return float((support[points[inside, 1], points[inside, 0]] > 0).sum()) / samples


def order_corners(points: np.ndarray) -> np.ndarray:
    center = points.mean(axis=0)
    angles = np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0])
    clockwise = points[np.argsort(angles)]
    start = int(np.argmin(clockwise.sum(axis=1)))
    return np.roll(clockwise, -start, axis=0)


def side_lengths(quad: np.ndarray) -> tuple[float, float]:
    top = np.linalg.norm(quad[1] - quad[0])
    bottom = np.linalg.norm(quad[2] - quad[3])
    left = np.linalg.norm(quad[3] - quad[0])
    right = np.linalg.norm(quad[2] - quad[1])
    return (top + bottom) / 2, (left + right) / 2


def side_ratio(quad: np.ndarray) -> float:
    horizontal, vertical = side_lengths(quad)
    long_side = max(horizontal, vertical)
    return 0.0 if long_side <= 0 else min(horizontal, vertical) / long_side


def portrait_corners(quad: np.ndarray) -> np.ndarray:
    # Carta sdraiata: il lato corto diventa quello in alto. Resta il dubbio
    # dei 180°, che si risolve confrontando entrambe le rotazioni nell'indice.
    horizontal, vertical = side_lengths(quad)
    return np.roll(quad, -1, axis=0) if horizontal > vertical else quad


def warp_card(image: np.ndarray, quad: np.ndarray) -> np.ndarray:
    source = portrait_corners(quad).astype(np.float32)
    target = np.array(
        [[0, 0], [CARD_WIDTH - 1, 0], [CARD_WIDTH - 1, CARD_HEIGHT - 1], [0, CARD_HEIGHT - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(source, target)
    return cv2.warpPerspective(image, matrix, (CARD_WIDTH, CARD_HEIGHT), flags=cv2.INTER_LINEAR)


def rotate_180(card: np.ndarray) -> np.ndarray:
    return cv2.rotate(card, cv2.ROTATE_180)


def box_percent(quad: np.ndarray, width: int, height: int) -> dict[str, float]:
    x0, y0 = np.clip(quad.min(axis=0), 0, [width, height])
    x1, y1 = np.clip(quad.max(axis=0), 0, [width, height])
    return {
        "x": round(float(x0 / width * 100), 1),
        "y": round(float(y0 / height * 100), 1),
        "width": round(float((x1 - x0) / width * 100), 1),
        "height": round(float((y1 - y0) / height * 100), 1),
    }


def suppress_overlaps(quads: list[np.ndarray]) -> list[np.ndarray]:
    kept: list[np.ndarray] = []
    for quad in sorted(quads, key=_bounds_area, reverse=True):
        if any(_overlaps(quad, other) for other in kept):
            continue
        kept.append(quad)
    return kept[:MAX_CARDS]


def _bounds(quad: np.ndarray) -> tuple[float, float, float, float]:
    x0, y0 = quad.min(axis=0)
    x1, y1 = quad.max(axis=0)
    return float(x0), float(y0), float(x1), float(y1)


def _bounds_area(quad: np.ndarray) -> float:
    x0, y0, x1, y1 = _bounds(quad)
    return (x1 - x0) * (y1 - y0)


def _overlaps(smaller: np.ndarray, larger: np.ndarray) -> bool:
    a = _bounds(smaller)
    b = _bounds(larger)
    width = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    height = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    intersection = width * height
    area_a = _bounds_area(smaller)
    union = area_a + _bounds_area(larger) - intersection
    if union > 0 and intersection / union > MAX_IOU:
        return True
    return area_a > 0 and intersection / area_a > MAX_CONTAINED
