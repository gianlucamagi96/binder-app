import cv2
import numpy as np

# Multipli della patch di DINOv2 (14 px) con la proporzione della carta. Niente
# ritaglio centrale: quello standard taglierebbe nome e numero della carta.
INPUT_WIDTH = 224
INPUT_HEIGHT = 308
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def preprocess(card: np.ndarray) -> np.ndarray:
    """BGR di qualunque misura -> tensore CHW normalizzato, float32."""
    resized = cv2.resize(card, (INPUT_WIDTH, INPUT_HEIGHT), interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    return ((rgb - MEAN) / STD).transpose(2, 0, 1)


def normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return (vectors / np.maximum(norms, 1e-12)).astype(np.float32)


class Embedder:
    """Stesso modello e stesso preprocessing per le immagini di riferimento e per le foto."""

    def __init__(self, model_name: str, device: str = "cpu", threads: int = 0):
        import torch
        from transformers import AutoModel

        if threads > 0:
            torch.set_num_threads(threads)
        self._torch = torch
        self.model_name = model_name
        self.device = device
        self.model = AutoModel.from_pretrained(model_name).to(device).eval()
        self.dim = int(self.model.config.hidden_size)

    def embed(self, cards: list[np.ndarray]) -> np.ndarray:
        if not cards:
            return np.zeros((0, self.dim), dtype=np.float32)
        batch = self._torch.from_numpy(np.stack([preprocess(card) for card in cards])).to(self.device)
        with self._torch.inference_mode():
            output = self.model(pixel_values=batch)
        # pooler_output è il token CLS dopo la layernorm finale.
        return normalize(output.pooler_output.float().cpu().numpy())
