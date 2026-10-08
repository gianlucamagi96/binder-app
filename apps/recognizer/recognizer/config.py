import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    index_dir: Path
    model_name: str
    device: str
    top_k: int
    torch_threads: int


def load_settings() -> Settings:
    return Settings(
        index_dir=Path(os.environ.get("INDEX_DIR", "data/index")),
        model_name=os.environ.get("MODEL_NAME", "facebook/dinov2-small"),
        device=os.environ.get("DEVICE", "cpu"),
        top_k=int(os.environ.get("TOP_K", "5")),
        # 0 lascia decidere a torch (un thread per core).
        torch_threads=int(os.environ.get("TORCH_THREADS", "0")),
    )
