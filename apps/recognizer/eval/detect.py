"""Misura il solo rilevamento dei contorni sulle foto sintetiche, che hanno gli angoli veri.

Per ogni foto: carta trovata giusta (IoU col vero >= 0.85), contorno sbagliato
(trovato qualcosa, ma non la carta) o nessun contorno; più i quadrilateri in
eccesso. Un contorno sbagliato è peggio di nessuno: senza contorni la pipeline
usa la foto intera, con un contorno sbagliato riconosce un pezzo di sfondo.

    python eval/detect.py eval/synthetic
"""

import argparse
import csv
import sys
import time
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

from recognizer.detect import find_card_quads

MIN_IOU = 0.85


def parse_quad(text: str) -> np.ndarray:
    return np.float32([[float(value) for value in point.split(",")] for point in text.split()])


def polygon_iou(a: np.ndarray, b: np.ndarray) -> float:
    a = cv2.convexHull(a.astype(np.float32))
    b = cv2.convexHull(b.astype(np.float32))
    intersection, _ = cv2.intersectConvexConvex(a, b)
    union = cv2.contourArea(a) + cv2.contourArea(b) - intersection
    return float(intersection / union) if union > 0 else 0.0


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("folder", type=Path)
    parser.add_argument("--wrong", action="store_true", help="elenca le foto con contorno sbagliato")
    args = parser.parse_args()

    with (args.folder / "labels.csv").open(encoding="utf-8") as handle:
        rows = [row for row in csv.DictReader(handle) if row.get("quad")]
    if not rows:
        raise SystemExit("labels.csv senza colonna quad: rigenera il set con eval/synth.py")

    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0, 0])  # n, giusti, sbagliati, nessuno
    extra = 0
    timings: list[float] = []
    corner_errors: list[float] = []
    wrong_files = []

    for row in rows:
        image = cv2.imread(str(args.folder / row["file"]), cv2.IMREAD_COLOR)
        truth = parse_quad(row["quad"])
        started = time.perf_counter()
        quads = find_card_quads(image)
        timings.append(time.perf_counter() - started)

        ious = [polygon_iou(quad, truth) for quad in quads]
        right = any(iou >= MIN_IOU for iou in ious)
        extra += sum(1 for iou in ious if iou < MIN_IOU)
        if right:
            best = quads[int(np.argmax(ious))]
            # Errore medio degli angoli, in % del lato lungo della carta, a meno della rotazione.
            long_side = max(np.linalg.norm(truth[0] - truth[3]), np.linalg.norm(truth[0] - truth[1]))
            error = min(
                np.linalg.norm(np.roll(best, shift, axis=0) - truth, axis=1).mean() for shift in range(4)
            )
            corner_errors.append(error / long_side * 100)
        elif quads:
            wrong_files.append((row["file"], round(max(ious), 2), row["tags"]))

        for tag in ["tutte", *[tag for tag in row["tags"].split(";") if tag]]:
            counts[tag][0] += 1
            counts[tag][1 if right else 2 if quads else 3] += 1

    print(f"\n{args.folder}  ({len(rows)} foto)\n")
    print(f"{'tag':<16}{'n':>5}{'giusti':>9}{'sbagliati':>11}{'nessuno':>9}")
    for tag, (n, right, wrong, none) in sorted(
        counts.items(), key=lambda item: (item[0] != "tutte", item[0])
    ):
        print(f"{tag:<16}{n:>5}{right / n:>9.1%}{wrong / n:>11.1%}{none / n:>9.1%}")
    print(f"\nquadrilateri in eccesso  {extra}")
    if corner_errors:
        mean, p90 = np.mean(corner_errors), np.percentile(corner_errors, 90)
        print(f"errore angoli (giusti)   media {mean:.2f}%, p90 {p90:.2f}%")
    print(f"tempo                    p50 {np.median(timings) * 1000:.0f} ms")
    if args.wrong:
        print("\ncontorni sbagliati (file, IoU migliore, tag):")
        for item in wrong_files:
            print(f"  {item}")


if __name__ == "__main__":
    main()
