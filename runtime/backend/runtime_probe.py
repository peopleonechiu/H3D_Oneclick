"""Build-time import/architecture gate. Does not claim GPU generation works."""
import argparse
import importlib
import json
import os
from pathlib import Path
import platform
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    root = Path(args.root).resolve()
    spec = json.loads((root / "packaging/windows/runtime-spec.json").read_text(encoding="utf-8-sig"))
    if sys.platform != "win32" or platform.machine().lower() not in ("amd64", "x86_64"):
        raise RuntimeError("Windows x64 Python is required; ARM Python is not supported")
    if f"{sys.version_info.major}.{sys.version_info.minor}" != spec["python"]["version"]:
        raise RuntimeError("Private Python version mismatch")
    if Path(sys.executable).resolve().parent != root / "runtime/python":
        raise RuntimeError("Python must execute from the staged private runtime")
    dll_handles = []
    for directory in (root / "runtime/cuda-dll", root / "runtime/python/Lib/site-packages/torch/lib"):
        if directory.is_dir():
            dll_handles.append(os.add_dll_directory(str(directory)))
    vendor = root / "runtime/backend/vendor/Hunyuan3D-2.1"
    sys.path[:0] = [str(vendor), str(vendor / "hy3dshape"), str(vendor / "hy3dpaint")]
    torch = importlib.import_module("torch")
    if torch.__version__ != spec["python"]["pytorch"] or torch.version.cuda != spec["python"]["cudaRuntime"]:
        raise RuntimeError("PyTorch/CUDA runtime version mismatch")
    if not Path(torch.__file__).resolve().is_relative_to(root):
        raise RuntimeError("PyTorch was imported outside the payload")
    for module in ("PIL.Image", "huggingface_hub", "trimesh", "hy3dshape", "hy3dshape.rembg"):
        imported = importlib.import_module(module)
        if imported.__file__ and not Path(imported.__file__).resolve().is_relative_to(root):
            raise RuntimeError(f"Import escaped private payload: {module}")
    rembg_model = root / "runtime/models/rembg/u2net.onnx"
    if not rembg_model.is_file() or rembg_model.stat().st_size == 0:
        raise RuntimeError("Bundled u2net.onnx is required; students must not trigger a hidden rembg download")
    import onnxruntime
    onnxruntime.InferenceSession(str(rembg_model), providers=["CPUExecutionProvider"])
    pbr = (root / "runtime/models/dinov2-giant").is_dir()
    if pbr:
        dino = root / "runtime/models/dinov2-giant"
        if not (dino / "config.json").is_file() or not any(p.stat().st_size for p in list(dino.glob('*.bin')) + list(dino.glob('*.safetensors'))):
            raise RuntimeError("DINO model is incomplete")
        upscale = vendor / "hy3dpaint/ckpt/RealESRGAN_x4plus.pth"
        if not upscale.is_file() or not upscale.stat().st_size:
            raise RuntimeError("RealESRGAN checkpoint is required for PBR")
        for module in ("custom_rasterizer", "DifferentiableRenderer.MeshRender", "textureGenPipeline"):
            importlib.import_module(module)
    print(json.dumps({"runtimeImports": "passed", "pbrImports": pbr, "gpuGenerationTested": False}))


if __name__ == "__main__":
    main()
