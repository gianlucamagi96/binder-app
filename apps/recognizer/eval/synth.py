"""Genera foto sintetiche dalle immagini di riferimento, con risposta nota.

Ogni foto mette una carta su uno sfondo con prospettiva, rotazione, luce,
riflessi, sfocatura e velo da sleeve casuali. Le distorsioni applicate finiscono
nei tag di labels.csv, così eval/run.py può dare le metriche per tipo.

Non sostituisce le foto reali: non simula olografie, carte piegate o riflessi veri.

    python eval/synth.py --count 300
"""

import argparse
import csv
import json
import random
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from recognizer.detect import CARD_HEIGHT, CARD_WIDTH


@dataclass(frozen=True)
class Framing:
    canvas: tuple[int, int]
    """Larghezza e altezza della foto."""
    card_width: tuple[float, float]
    """Larghezza della carta, in frazione della foto."""
    shift: float
    angle: float
    jitter: float


FRAMINGS = {
    # Foto qualunque, ad esempio caricata dalla galleria: carta piccola e storta.
    "free": Framing(canvas=(1000, 1300), card_width=(0.45, 0.72), shift=80, angle=15, jitter=40),
    # Scatto dal mirino dell'app, che ha la forma della carta e ritaglia la foto:
    # la carta lo riempie quasi tutto e a volte ne esce un po'.
    "viewfinder": Framing(canvas=(900, 1257), card_width=(0.85, 1.02), shift=25, angle=6, jitter=15),
}


def reprint_ids(catalog: dict[str, dict]) -> set[str]:
    """Carte il cui nome inglese compare in più set: candidate ristampe."""
    sets_by_name: dict[str, set[str]] = {}
    for entry in catalog.values():
        name = entry["names"].get("en") or next(iter(entry["names"].values()), "")
        sets_by_name.setdefault(name.lower(), set()).add(entry["set_id"])
    return {
        card_id
        for card_id, entry in catalog.items()
        if len(sets_by_name.get((entry["names"].get("en") or "").lower(), ())) > 1
    }


def background(rng: random.Random, card: np.ndarray, tags: list[str], size: tuple[int, int]) -> np.ndarray:
    canvas_width, canvas_height = size
    noise = np.random.default_rng(rng.randrange(1 << 30))
    kind = rng.choices(["uniform", "texture", "low_contrast"], weights=[0.4, 0.35, 0.25])[0]
    if kind == "low_contrast":
        # Sfondo del colore del bordo della carta: il caso più difficile per i contorni.
        border = np.concatenate([card[:12].reshape(-1, 3), card[-12:].reshape(-1, 3)])
        color = border.mean(axis=0) + noise.uniform(-18, 18, 3)
        tags.append("low_contrast")
    else:
        color = noise.uniform(25, 230, 3)
    canvas = np.empty((canvas_height, canvas_width, 3), dtype=np.float32)
    canvas[:] = color
    if kind == "texture":
        small = noise.normal(0, 40, (canvas_height // 40, canvas_width // 40, 3)).astype(np.float32)
        canvas += cv2.resize(small, (canvas_width, canvas_height), interpolation=cv2.INTER_CUBIC)
    canvas += noise.normal(0, 6, canvas.shape)
    return np.clip(canvas, 0, 255).astype(np.uint8)


def sleeve(card: np.ndarray, rng: random.Random) -> np.ndarray:
    veiled = cv2.addWeighted(
        card, 1 - rng.uniform(0.08, 0.18), np.full_like(card, 245), rng.uniform(0.08, 0.18), 0
    )
    # Riflesso a striscia tipico della plastica.
    stripe = np.zeros(card.shape[:2], dtype=np.float32)
    x = rng.randint(0, card.shape[1])
    cv2.line(stripe, (x, 0), (x + rng.randint(-200, 200), card.shape[0]), 1.0, rng.randint(15, 45))
    stripe = cv2.GaussianBlur(stripe, (0, 0), 12)[..., None] * rng.uniform(0.25, 0.5)
    return np.clip(veiled * (1 - stripe) + 255 * stripe, 0, 255).astype(np.uint8)


def glare(photo: np.ndarray, center: np.ndarray, rng: random.Random) -> np.ndarray:
    mask = np.zeros(photo.shape[:2], dtype=np.float32)
    point = (int(center[0] + rng.uniform(-150, 150)), int(center[1] + rng.uniform(-200, 200)))
    axes = (rng.randint(40, 140), rng.randint(25, 90))
    cv2.ellipse(mask, point, axes, rng.uniform(0, 180), 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), rng.uniform(15, 35))[..., None] * rng.uniform(0.6, 0.95)
    return np.clip(photo * (1 - mask) + 255 * mask, 0, 255).astype(np.uint8)


def render(
    card: np.ndarray, rng: random.Random, framing: Framing
) -> tuple[np.ndarray, list[str], np.ndarray]:
    canvas_width, canvas_height = framing.canvas
    tags: list[str] = []
    card = cv2.resize(card, (CARD_WIDTH, CARD_HEIGHT), interpolation=cv2.INTER_AREA)
    if rng.random() < 0.3:
        card = sleeve(card, rng)
        tags.append("sleeve")
    photo = background(rng, card, tags, framing.canvas)

    width = rng.uniform(*framing.card_width) * canvas_width
    height = width * CARD_HEIGHT / CARD_WIDTH
    center = np.array(
        [
            canvas_width / 2 + rng.uniform(-framing.shift, framing.shift),
            canvas_height / 2 + rng.uniform(-framing.shift, framing.shift),
        ]
    )
    corners = np.array([[-width, -height], [width, -height], [width, height], [-width, height]]) / 2
    angle = rng.uniform(-framing.angle, framing.angle)
    if rng.random() < 0.15:
        angle += 180
        tags.append("upside_down")
    radians = np.deg2rad(angle)
    rotation = np.array([[np.cos(radians), -np.sin(radians)], [np.sin(radians), np.cos(radians)]])
    jitter = np.array(
        [
            [rng.uniform(-framing.jitter, framing.jitter), rng.uniform(-framing.jitter, framing.jitter)]
            for _ in range(4)
        ]
    )
    target = (corners @ rotation.T + center + jitter).astype(np.float32)
    source = np.float32(
        [[0, 0], [CARD_WIDTH - 1, 0], [CARD_WIDTH - 1, CARD_HEIGHT - 1], [0, CARD_HEIGHT - 1]]
    )
    matrix = cv2.getPerspectiveTransform(source, target)
    warped = cv2.warpPerspective(card, matrix, (canvas_width, canvas_height))
    mask = cv2.warpPerspective(np.full(card.shape[:2], 255, np.uint8), matrix, (canvas_width, canvas_height))
    photo[mask > 0] = warped[mask > 0]

    if rng.random() < 0.35:
        photo = glare(photo, center, rng)
        tags.append("glare")
    if rng.random() < 0.25:
        gamma = rng.uniform(1.6, 2.4)
        photo = (255 * (photo / 255.0) ** gamma).astype(np.uint8)
        tags.append("dark")
    else:
        photo = cv2.convertScaleAbs(photo, alpha=rng.uniform(0.8, 1.2), beta=rng.uniform(-20, 20))
    if rng.random() < 0.3:
        size = rng.choice([7, 9, 11])
        kernel = np.zeros((size, size), dtype=np.float32)
        kernel[size // 2] = 1 / size
        rotate = cv2.getRotationMatrix2D((size / 2 - 0.5, size / 2 - 0.5), rng.uniform(0, 180), 1)
        photo = cv2.filter2D(photo, -1, cv2.warpAffine(kernel, rotate, (size, size)))
        tags.append("blur")
    ok, encoded = cv2.imencode(".jpg", photo, [cv2.IMWRITE_JPEG_QUALITY, rng.randint(70, 90)])
    assert ok
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR), tags, target


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--refs-dir", type=Path, default=Path("data/refs"))
    parser.add_argument("--out", type=Path, default=Path("eval/synthetic"))
    parser.add_argument("--count", type=int, default=300)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--framing", choices=sorted(FRAMINGS), default="free")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    catalog = json.loads((args.refs_dir / "cards.json").read_text("utf-8"))
    reprints = reprint_ids(catalog)
    items = sorted(
        (card_id, lang, path) for card_id, entry in catalog.items() for lang, path in entry["files"].items()
    )
    # Metà del campione sulle ristampe: sono il caso più difficile e il più raro.
    reprint_items = [item for item in items if item[0] in reprints]
    half = min(len(reprint_items), args.count // 2)
    sample = rng.sample(reprint_items, half) + rng.sample(items, args.count - half)

    images_dir = args.out / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    with (args.out / "labels.csv").open("w", newline="", encoding="utf-8") as labels:
        writer = csv.writer(labels)
        writer.writerow(["file", "card_id", "tags", "quad"])
        for number, (card_id, lang, path) in enumerate(sample):
            card = cv2.imread(str(args.refs_dir / path), cv2.IMREAD_COLOR)
            photo, tags, quad = render(card, rng, FRAMINGS[args.framing])
            tags.append(lang)
            if card_id in reprints:
                tags.append("reprint")
            name = f"{number:05d}.jpg"
            cv2.imwrite(str(images_dir / name), photo)
            # Angoli veri della carta, per misurare il rilevamento con eval/detect.py.
            corners = " ".join(f"{x:.0f},{y:.0f}" for x, y in quad)
            writer.writerow([f"images/{name}", card_id, ";".join(tags), corners])
    print(f"{len(sample)} foto in {args.out}")


if __name__ == "__main__":
    main()
