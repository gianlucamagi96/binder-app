"""Misura l'accuratezza della pipeline su foto con risposta nota.

Legge una cartella con labels.csv (file,card_id,tags; tag separati da ';') e
riporta top-1 / top-5 in totale e per tag, il tasso di contorni trovati, la
latenza e quanti errori sono confusioni tra ristampe (stesso nome, altro set).

    python eval/run.py eval/synthetic
    python eval/run.py eval/photos --misses
"""

import argparse
import csv
import json
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

from recognizer.config import load_settings
from recognizer.embed import Embedder
from recognizer.index import CardIndex
from recognizer.pipeline import Detection, Recognizer
from recognizer.verify import ReferenceFeatures


def main_detection(detections: list[Detection]) -> Detection | None:
    # Le foto di valutazione hanno una carta sola: teniamo quella più sicura.
    with_candidates = [detection for detection in detections if detection.candidates]
    return max(with_candidates, key=lambda detection: detection.candidates[0].score, default=None)


def rate(hits: int, total: int) -> str:
    return f"{hits / total:6.1%}" if total else "     -"


def main() -> None:
    # La console di Windows non è UTF-8 di default.
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("folder", type=Path)
    parser.add_argument("--misses", action="store_true", help="elenca gli errori di top-1")
    parser.add_argument("--reports", type=Path, default=Path("eval/reports"))
    parser.add_argument("--no-verify", action="store_true", help="senza verifica geometrica, per confronto")
    args = parser.parse_args()

    settings = load_settings()
    index = CardIndex.load(settings.index_dir, settings.model_name)
    recognizer = Recognizer(
        Embedder(settings.model_name, settings.device, settings.torch_threads),
        index,
        settings.top_k,
        None if args.no_verify else ReferenceFeatures.load(settings.index_dir),
    )
    names = {row["card_id"]: (row.get("name") or "").lower() for row in index.meta}
    indexed = set(names)

    with (args.folder / "labels.csv").open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    totals: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    latencies: list[float] = []
    detected = 0
    reprint_confusions = 0
    ambiguous = 0
    confident_hits = 0
    margins_right: list[float] = []
    margins_wrong: list[float] = []
    misses = []
    skipped = 0

    for row in rows:
        if row["card_id"] not in indexed:
            skipped += 1
            continue
        image = cv2.imread(str(args.folder / row["file"]), cv2.IMREAD_COLOR)
        if image is None:
            print(f"  ! foto illeggibile: {row['file']}")
            continue
        started = time.perf_counter()
        detection = main_detection(recognizer.identify(image))
        latencies.append(time.perf_counter() - started)

        ids = [hit.card_id for hit in detection.candidates] if detection else []
        top1 = ids[:1] == [row["card_id"]]
        top5 = row["card_id"] in ids[:5]
        detected += bool(detection and detection.detected)
        if detection and detection.ambiguous:
            ambiguous += 1
        else:
            confident_hits += top1
        tags = ["tutte", *[tag for tag in row.get("tags", "").split(";") if tag]]
        if detection and not detection.detected:
            tags.append("senza_contorni")
        for tag in tags:
            totals[tag][0] += 1
            totals[tag][1] += top1
            totals[tag][2] += top5

        if detection and len(detection.candidates) > 1:
            margin = detection.candidates[0].score - detection.candidates[1].score
            (margins_right if top1 else margins_wrong).append(margin)
        if not top1:
            if ids and names.get(ids[0]) == names.get(row["card_id"]):
                reprint_confusions += 1
            misses.append(
                {
                    "file": row["file"],
                    "expected": row["card_id"],
                    "got": ids[:3],
                    "scores": [round(hit.score, 3) for hit in detection.candidates[:3]] if detection else [],
                    "detected": bool(detection and detection.detected),
                    "inliers": detection.inliers if detection else {},
                    "tags": row.get("tags", ""),
                }
            )

    total = totals["tutte"][0]
    if not total:
        raise SystemExit("Nessuna foto valutabile: le carte delle etichette non sono nell'indice")

    print(f"\n{args.folder}  ({total} foto, modello {settings.model_name}, indice {index.size} vettori)")
    if skipped:
        print(f"  {skipped} foto saltate: carta non presente nell'indice")
    print(f"\n{'tag':<16}{'n':>6}{'top-1':>9}{'top-5':>9}")
    for tag, (count, hit1, hit5) in sorted(totals.items(), key=lambda item: (item[0] != "tutte", item[0])):
        print(f"{tag:<16}{count:>6}{rate(hit1, count):>9}{rate(hit5, count):>9}")

    errors = total - totals["tutte"][1]
    print(f"\ncontorni trovati     {rate(detected, total)}")
    print(f"errori da ristampa   {reprint_confusions} su {errors} errori di top-1")
    confident = total - ambiguous
    print(
        f"incerte (ambiguous)  {rate(ambiguous, total)}   top-1 sulle altre {rate(confident_hits, confident)}"
    )
    print(
        f"latenza              p50 {np.median(latencies) * 1000:.0f} ms, "
        f"p95 {np.percentile(latencies, 95) * 1000:.0f} ms"
    )
    if margins_wrong:
        print(
            "distacco 1°-2°       "
            f"giusti p10 {np.percentile(margins_right, 10):.3f}, "
            f"sbagliati p90 {np.percentile(margins_wrong, 90):.3f}"
        )

    if args.misses:
        print("\nerrori di top-1:")
        for miss in misses:
            print(
                f"  {miss['file']}  atteso {miss['expected']}  ottenuto {miss['got']} {miss['scores']}"
                f"  contorni={'sì' if miss['detected'] else 'no'}  [{miss['tags']}]"
            )

    args.reports.mkdir(parents=True, exist_ok=True)
    report = args.reports / f"{args.folder.name}-{datetime.now():%Y%m%d-%H%M%S}.json"
    report.write_text(
        json.dumps(
            {
                "folder": str(args.folder),
                "model": settings.model_name,
                "index": index.manifest,
                "totals": {
                    tag: dict(zip(["n", "top1", "top5"], values, strict=True))
                    for tag, values in totals.items()
                },
                "detected": detected,
                "reprint_confusions": reprint_confusions,
                "verification": recognizer.references is not None,
                "ambiguous": ambiguous,
                "confident_top1": confident_hits,
                "latency_ms": {
                    "p50": float(np.median(latencies) * 1000),
                    "p95": float(np.percentile(latencies, 95) * 1000),
                },
                "misses": misses,
            },
            ensure_ascii=False,
            indent=1,
        ),
        "utf-8",
    )
    print(f"\nreport: {report}")


if __name__ == "__main__":
    main()
