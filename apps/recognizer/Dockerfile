# Servizio di riconoscimento, solo CPU. L'indice non è nell'immagine: si monta
# in /index (vedi docker-compose.yml), così si aggiorna senza ricostruirla.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/opt/hf

WORKDIR /app

# torch dalla build CPU: quella di default si porta dietro CUDA (diversi GB in più).
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch

# Prima le dipendenze, poi il codice: cambiare il codice non reinstalla tutto.
COPY pyproject.toml ./
RUN mkdir recognizer && touch recognizer/__init__.py \
    && pip install ".[ml,service]" \
    && pip uninstall -y recognizer

# Il modello entra nell'immagine: a runtime non serve scaricare niente.
ARG MODEL_NAME=facebook/dinov2-small
RUN python -c "from transformers import AutoModel; AutoModel.from_pretrained('${MODEL_NAME}')"

COPY recognizer ./recognizer
RUN pip install --no-deps .

RUN useradd --system --uid 10001 recognizer
USER recognizer

ENV INDEX_DIR=/index \
    MODEL_NAME=${MODEL_NAME} \
    DEVICE=cpu \
    HF_HUB_OFFLINE=1

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

CMD ["uvicorn", "recognizer.app:app", "--host", "0.0.0.0", "--port", "8000"]
