"""Private Windows backend wrapper for the JIC local adapter.

This process is intentionally a small HTTP boundary around Tencent's
Hunyuan3D Python pipeline. The release package supplies the Python runtime,
PyTorch/CUDA wheels, the official source tree, and native extensions. Students
do not run this module directly.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable


MODEL_ID = "hunyuan3d-2-1-8bit"
SHAPE_MIN_VRAM_BYTES = 10 * 1024**3
TEXTURE_MIN_VRAM_BYTES = 21 * 1024**3


class BackendError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 409, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}


def json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def error_payload(error: BackendError) -> dict[str, Any]:
    return {"error": {"code": error.code, "message": error.message, "details": error.details}}


def model_files_present(model_dir: Path) -> bool:
    if not model_dir.is_dir():
        return False
    for candidate in (model_dir / "config.json", model_dir / "model_index.json"):
        if candidate.is_file():
            return True
    return (
        any(model_dir.rglob("*.safetensors"))
        or any(model_dir.rglob("*.bin"))
        or any(model_dir.rglob("*.ckpt"))
        or any(model_dir.rglob("*.pth"))
    )


def decode_image(encoded: str):
    try:
        from PIL import Image

        return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGBA")
    except Exception as exc:  # pragma: no cover - depends on private runtime
        raise BackendError("INVALID_IMAGE", f"Unable to decode image: {exc}", 400) from exc


class HunyuanBackend:
    def __init__(self, model_dir: Path, source_root: Path | None, low_vram_mode: bool = False):
        self.model_dir = model_dir.resolve()
        self.source_root = source_root.resolve() if source_root else None
        self.low_vram_mode = low_vram_mode
        self.shape_pipeline = None
        self.paint_pipeline = None
        self._torch = None
        self._paint_error: str | None = None
        self._load_lock = threading.Lock()
        self._generation_lock = threading.Lock()
        self._temporary_root = Path(tempfile.mkdtemp(prefix="jic-hunyuan-backend-"))

    @property
    def loaded(self) -> bool:
        return self.shape_pipeline is not None

    def _import_torch(self):
        if self._torch is not None:
            return self._torch
        try:
            import torch
        except Exception as exc:  # pragma: no cover - depends on private runtime
            raise BackendError("BACKEND_START_FAILED", f"PyTorch runtime is unavailable: {exc}", 503) from exc
        self._torch = torch
        return torch

    def hardware(self) -> dict[str, Any]:
        try:
            torch = self._import_torch()
        except BackendError as exc:
            return {
                "supported": False,
                "cuda": False,
                "reason": exc.message,
            }

        if not torch.cuda.is_available():
            return {
                "supported": False,
                "cuda": False,
                "reason": "No compatible NVIDIA CUDA device is available.",
            }

        device_index = torch.cuda.current_device()
        properties = torch.cuda.get_device_properties(device_index)
        vram = int(getattr(properties, "total_memory", 0))
        return {
            "supported": vram >= SHAPE_MIN_VRAM_BYTES,
            "cuda": True,
            "device": int(device_index),
            "name": str(getattr(properties, "name", "NVIDIA GPU")),
            "vramBytes": vram,
            "vramGb": round(vram / 1024**3, 1),
            "shapeMinimumVramGb": round(SHAPE_MIN_VRAM_BYTES / 1024**3, 1),
            "textureMinimumVramGb": round(TEXTURE_MIN_VRAM_BYTES / 1024**3, 1),
            "textureSupported": vram >= TEXTURE_MIN_VRAM_BYTES,
            "reason": None if vram >= SHAPE_MIN_VRAM_BYTES else "At least 10 GB VRAM is required for shape generation.",
        }

    def texture_capability(self) -> bool:
        hardware = self.hardware()
        if not hardware.get("textureSupported", False):
            return False
        if not self.source_root:
            return False
        dino_raw = os.environ.get("JIC_DINO_MODEL_PATH", "").strip()
        dino_path = Path(dino_raw) if dino_raw else None
        return (
            (self.source_root / "hy3dpaint").is_dir()
            and (self.source_root / "hy3dpaint" / "textureGenPipeline.py").is_file()
            and dino_path is not None
            and dino_path.is_dir()
        )

    def _prepare_source_imports(self):
        if not self.source_root:
            return
        paths = [self.source_root, self.source_root / "hy3dshape", self.source_root / "hy3dpaint"]
        for path in reversed(paths):
            if path.is_dir() and str(path) not in sys.path:
                sys.path.insert(0, str(path))

    def load(self):
        if self.loaded:
            return
        if not model_files_present(self.model_dir):
            raise BackendError("MODEL_MISSING", "The Hunyuan3D model files are not installed.", 409)

        hardware = self.hardware()
        if not hardware.get("supported", False):
            raise BackendError(
                "UNSUPPORTED_HARDWARE",
                hardware.get("reason") or "A compatible NVIDIA GPU is required.",
                412,
                {"hardware": hardware},
            )

        with self._load_lock:
            if self.loaded:
                return
            self._prepare_source_imports()
            try:
                from hy3dshape import Hunyuan3DDiTFlowMatchingPipeline
            except Exception as exc:  # pragma: no cover - depends on private runtime
                raise BackendError("BACKEND_START_FAILED", f"Hunyuan3D shape package is unavailable: {exc}", 503) from exc

            try:
                print(f"[hunyuan] loading shape pipeline from {self.model_dir}", flush=True)
                self.shape_pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(str(self.model_dir))
                if hasattr(self.shape_pipeline, "to"):
                    self.shape_pipeline.to("cuda")
            except Exception as exc:  # pragma: no cover - depends on private runtime
                self.shape_pipeline = None
                raise BackendError("BACKEND_START_FAILED", f"Unable to load Hunyuan3D shape model: {exc}", 503) from exc

    def _load_paint_pipeline(self):
        if self.paint_pipeline is not None:
            return
        if not self.texture_capability():
            raise BackendError(
                "TEXTURE_UNAVAILABLE",
                "PBR texture requires the paint runtime and at least 21 GB VRAM.",
                412,
            )
        self._prepare_source_imports()
        try:
            from textureGenPipeline import Hunyuan3DPaintConfig, Hunyuan3DPaintPipeline
        except Exception as exc:  # pragma: no cover - depends on private runtime
            self._paint_error = str(exc)
            raise BackendError("TEXTURE_UNAVAILABLE", f"PBR paint package is unavailable: {exc}", 412) from exc

        try:
            config = Hunyuan3DPaintConfig(6, 512)
            if self.source_root:
                config.realesrgan_ckpt_path = str(self.source_root / "hy3dpaint" / "ckpt" / "RealESRGAN_x4plus.pth")
                config.multiview_cfg_path = str(self.source_root / "hy3dpaint" / "cfgs" / "hunyuan-paint-pbr.yaml")
                config.custom_pipeline = str(self.source_root / "hy3dpaint" / "hunyuanpaintpbr")
            config.multiview_pretrained_path = str(self.model_dir)
            dino_path = os.environ.get("JIC_DINO_MODEL_PATH", "").strip()
            if dino_path:
                config.dino_ckpt_path = dino_path
            self.paint_pipeline = Hunyuan3DPaintPipeline(config)
        except Exception as exc:  # pragma: no cover - depends on private runtime
            self._paint_error = str(exc)
            self.paint_pipeline = None
            raise BackendError("TEXTURE_UNAVAILABLE", f"Unable to load PBR paint model: {exc}", 412) from exc

    def unload(self):
        self.paint_pipeline = None
        self.shape_pipeline = None
        torch = self._torch
        if torch is not None and torch.cuda.is_available():
            torch.cuda.empty_cache()

    def _run_shape(self, image, payload: dict[str, Any]):
        torch = self._import_torch()
        seed = int(payload.get("seed") or 42)
        generator = torch.Generator(device="cuda").manual_seed(seed)
        steps = max(1, min(20, int(payload.get("num_inference_steps") or payload.get("steps") or 30)))
        guidance = float(payload.get("guidance_scale") or 5.0)
        resolution = max(64, min(512, int(payload.get("octree_resolution") or 256)))
        kwargs = {
            "image": image,
            "num_inference_steps": steps,
            "guidance_scale": guidance,
            "octree_resolution": resolution,
            "generator": generator,
        }
        try:
            return self.shape_pipeline(**kwargs)[0]
        except TypeError:
            # Keep compatibility with an older pinned Tencent pipeline whose
            # callable only accepts the image and uses its own defaults.
            kwargs.pop("generator", None)
            return self.shape_pipeline(image=image, num_inference_steps=steps, guidance_scale=guidance)[0]

    def generate(self, payload: dict[str, Any], progress: Callable[[str, str], None] | None = None) -> bytes:
        if not self.loaded:
            self.load()
        if not isinstance(payload.get("image"), str) or not payload["image"]:
            raise BackendError("INVALID_IMAGE", "Missing image.", 400)

        wants_texture = bool(payload.get("texture", False))
        if wants_texture:
            self._load_paint_pipeline()
        image = decode_image(payload["image"])
        if bool(payload.get("remove_background", True)):
            try:
                from hy3dshape.rembg import BackgroundRemover

                image = BackgroundRemover()(image)
            except Exception as exc:  # pragma: no cover - depends on private runtime
                raise BackendError("GENERATION_FAILED", f"Background removal failed: {exc}", 500) from exc

        with self._generation_lock:
            if progress:
                progress("shape", "Generating shape")
            try:
                mesh = self._run_shape(image, payload)
            except BackendError:
                raise
            except Exception as exc:  # pragma: no cover - depends on private runtime
                raise BackendError("GENERATION_FAILED", f"Shape generation failed: {exc}", 500) from exc

            job_id = uuid.uuid4().hex
            initial_path = self._temporary_root / f"{job_id}_shape.glb"
            mesh.export(str(initial_path))
            final_path = initial_path

            if wants_texture:
                if progress:
                    progress("texture", "Painting PBR texture")
                try:
                    output_obj = self._temporary_root / f"{job_id}_texturing.obj"
                    textured_obj = self.paint_pipeline(
                        mesh_path=str(initial_path),
                        image_path=image,
                        output_mesh_path=str(output_obj),
                        save_glb=False,
                    )
                    from hy3dpaint.convert_utils import create_glb_with_pbr_materials

                    textured_glb = self._temporary_root / f"{job_id}_textured.glb"
                    create_glb_with_pbr_materials(
                        str(textured_obj),
                        {
                            "albedo": str(textured_obj).replace(".obj", ".jpg"),
                            "metallic": str(textured_obj).replace(".obj", "_metallic.jpg"),
                            "roughness": str(textured_obj).replace(".obj", "_roughness.jpg"),
                        },
                        str(textured_glb),
                    )
                    final_path = textured_glb
                except BackendError:
                    raise
                except Exception as exc:  # pragma: no cover - depends on private runtime
                    # Texture was explicitly requested. Do not return an
                    # untextured success when the PBR stage failed.
                    raise BackendError("GENERATION_FAILED", f"PBR texture generation failed: {exc}", 500) from exc

            data = final_path.read_bytes()
            if data[:4] != b"glTF":
                raise BackendError("GENERATION_FAILED", "Backend did not produce a valid GLB.", 500)
            return data

    def health(self) -> dict[str, Any]:
        hardware = self.hardware()
        return {
            "status": "healthy",
            "backend": "hunyuan3d-cuda",
            "modelReady": self.loaded,
            "hardware": hardware,
            "capabilities": {
                "shape": self.loaded,
                "texture": self.texture_capability(),
                "formats": ["glb"],
                "stream": True,
                "cancel": True,
            },
        }

    def models(self) -> dict[str, Any]:
        return {
            "data": [{
                "id": MODEL_ID,
                "state": "ready" if self.loaded else "unloaded",
                "capabilities": ["3d"] + (["texture"] if self.texture_capability() else []),
            }]
        }


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "JIC-Hunyuan3D/0.1"

    @property
    def backend(self) -> HunyuanBackend:
        return self.server.backend  # type: ignore[attr-defined]

    def log_message(self, format: str, *args):
        print(f"[hunyuan-http] {self.address_string()} - {format % args}", flush=True)

    def _send_json(self, status: int, payload: dict[str, Any]):
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 50 * 1024 * 1024:
                raise BackendError("INVALID_REQUEST", "Request is too large.", 413)
            value = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(value, dict):
                raise ValueError("expected a JSON object")
            return value
        except BackendError:
            raise
        except Exception as exc:
            raise BackendError("INVALID_REQUEST", f"Invalid JSON: {exc}", 400) from exc

    def _send_glb(self, data: bytes):
        self.send_response(200)
        self.send_header("Content-Type", "model/gltf-binary")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Disposition", 'inline; filename="hunyuan3d.glb"')
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def _send_sse(self, payload: dict[str, Any]):
        self.wfile.write(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8"))
        self.wfile.flush()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, self.backend.health())
            return
        if self.path == "/v1/models":
            self._send_json(200, self.backend.models())
            return
        self._send_json(404, {"error": {"code": "NOT_FOUND", "message": "Route not found."}})

    def do_POST(self):
        stream_started = False
        try:
            if self.path == "/v1/load-model":
                self._read_json()
                self.backend.load()
                self._send_json(200, {"id": MODEL_ID, "state": "ready", "capabilities": self.backend.health()["capabilities"]})
                return
            if self.path == "/v1/unload-model":
                self._read_json()
                self.backend.unload()
                self._send_json(200, {"id": MODEL_ID, "state": "unloaded"})
                return
            if self.path == "/v1/models/rescan":
                self._send_json(200, self.backend.models())
                return
            if self.path == "/generate":
                payload = self._read_json()
                self._send_glb(self.backend.generate(payload))
                return
            if self.path == "/v1/3d/generations":
                payload = self._read_json()
                wants_stream = payload.get("stream") is True
                if not wants_stream:
                    self._send_glb(self.backend.generate(payload))
                    return

                stream_started = True
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()

                def progress(stage: str, message: str):
                    self._send_sse({"type": "progress", "stage": stage, "step": 0, "total": 0, "indeterminate": True, "message": message})

                data = self.backend.generate(payload, progress=progress)
                self._send_sse({"type": "complete", "format": "glb", "data": base64.b64encode(data).decode("ascii")})
                return
            self._send_json(404, {"error": {"code": "NOT_FOUND", "message": "Route not found."}})
        except BackendError as exc:
            if stream_started:
                try:
                    self._send_sse({"type": "error", "code": exc.code, "message": exc.message, "details": exc.details})
                    return
                except Exception:
                    return
            self._send_json(exc.status, error_payload(exc))
        except BrokenPipeError:
            return
        except Exception as exc:  # pragma: no cover - depends on private runtime
            print(traceback.format_exc(), flush=True)
            self._send_json(500, {"error": {"code": "BACKEND_ERROR", "message": str(exc)}})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="JIC private Hunyuan3D CUDA backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=11234)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--source-root", default="")
    parser.add_argument("--low-vram-mode", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    model_dir = Path(args.model_dir)
    source_root = Path(args.source_root) if args.source_root else None
    backend = HunyuanBackend(model_dir, source_root, args.low_vram_mode)
    server = ThreadingHTTPServer((args.host, args.port), RequestHandler)
    server.backend = backend  # type: ignore[attr-defined]
    print(f"[hunyuan] listening on http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    finally:
        backend.unload()
        shutil.rmtree(backend._temporary_root, ignore_errors=True)
        server.server_close()


if __name__ == "__main__":
    main()
