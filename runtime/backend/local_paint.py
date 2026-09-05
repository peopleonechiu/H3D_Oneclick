"""Adapt only the pinned paint module's HF lookup to an installed local tree.

No global huggingface_hub monkey patch, fallback download, or upstream file edit.
"""
from pathlib import Path
from types import SimpleNamespace


def bind_local_paint(module, model_dir):
    root = Path(model_dir).resolve()
    paint = root / "hunyuan3d-paintpbr-v2-1"
    if not (paint / "model_index.json").is_file():
        raise RuntimeError("Local PBR model_index.json is missing")

    def snapshot_download(repo_id, **kwargs):
        if Path(repo_id).resolve() != root:
            raise RuntimeError("Unexpected paint model path; remote downloads are disabled")
        return str(root)

    # The pinned module only uses this namespace for snapshot_download. Other
    # modules retain the original HF package and are not affected.
    module.huggingface_hub = SimpleNamespace(snapshot_download=snapshot_download)
