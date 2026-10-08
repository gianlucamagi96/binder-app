import logging
import time
from contextlib import asynccontextmanager
from typing import Annotated

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile

from recognizer.config import load_settings
from recognizer.embed import Embedder
from recognizer.index import CardIndex, Hit
from recognizer.pipeline import Detection, Recognizer
from recognizer.verify import ReferenceFeatures

MAX_PHOTO_BYTES = 8 * 1024 * 1024
logger = logging.getLogger("recognizer")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = load_settings()
    # Indice e modello si caricano una volta sola: se l'indice non corrisponde
    # al modello il servizio non parte.
    index = CardIndex.load(settings.index_dir, settings.model_name)
    references = ReferenceFeatures.load(settings.index_dir)
    if references is None:
        logger.warning("Feature ORB assenti: le ristampe restano indistinte. Ricostruisci l'indice.")
    elif references.rows != index.size:
        raise RuntimeError("Feature ORB e indice non corrispondono: ricostruisci l'indice")
    embedder = Embedder(settings.model_name, settings.device, settings.torch_threads)
    app.state.recognizer = Recognizer(embedder, index, settings.top_k, references)
    yield


app = FastAPI(title="recognizer", lifespan=lifespan)


@app.get("/health")
def health():
    recognizer: Recognizer = app.state.recognizer
    manifest = recognizer.index.manifest
    return {
        "model": manifest["model"],
        "vectors": recognizer.index.size,
        "builtAt": manifest.get("built_at"),
        "device": recognizer.embedder.device,
        "verification": recognizer.references is not None,
    }


# Funzione sincrona: FastAPI la esegue in un thread, così il calcolo non blocca il loop.
@app.post("/identify")
def identify(photo: Annotated[UploadFile, File()]):
    started = time.perf_counter()
    data = photo.file.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Foto troppo grande")
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=422, detail="Foto illeggibile")

    recognizer: Recognizer = app.state.recognizer
    detections = recognizer.identify(image)
    return {
        "detections": [
            {
                "box": detection.box,
                "detected": detection.detected,
                "ambiguous": detection.ambiguous,
                "candidates": [candidate_json(recognizer, detection, hit) for hit in detection.candidates],
            }
            for detection in detections
        ],
        "ms": round((time.perf_counter() - started) * 1000),
    }


def candidate_json(recognizer: Recognizer, detection: Detection, hit: Hit) -> dict:
    # Nome, numero e set dai metadati dell'indice: bastano al backend se TCGdex non risponde.
    info = recognizer.index.info(hit.card_id, hit.lang)
    return {
        "cardId": hit.card_id,
        "lang": hit.lang,
        "score": round(hit.score, 4),
        "inliers": detection.inliers.get(hit.card_id),
        "name": info.get("name", ""),
        "localId": info.get("local_id", ""),
        "setId": info.get("set_id", ""),
    }
