# JIC_YZUIC_Hunyuan3D Implementation Plan

## Objective

Deliver a platform-independent local workflow where students install the application first, open a localhost Web UI, download the model from the UI, upload one photo, generate a GLB, preview it, and reopen the application without reinstalling dependencies.

## Delivery order

### Phase 1 — Docker development slice

- Create a static Web UI matching the supplied Photo / Model / Advanced / Preview layout.
- Apply the MoMA-inspired editorial visual direction and add a persistent Traditional Chinese / English switch.
- Create a Local Adapter with a stable `/api` interface for health, capabilities, model download, jobs, SSE progress, artifacts, and output-folder actions.
- Create a mock 3D backend that emits progress and a valid GLB so the complete UI flow can be tested without a model or GPU.
- Add Docker Compose services for the UI, adapter, mock backend, and contract test workflow.

### Phase 2 — Mac native adapter

- Keep the Web UI and Local Adapter interface unchanged.
- Launch the native `mlx-serve` binary as a managed child process or connect to an explicitly configured local instance.
- Map `/api/jobs` to `POST /v1/3d/generations` with SSE progress and GLB completion.
- Add model manifest, resumable download, hash verification, model rescan/load, memory probe, and native output-folder opening.
- Validate on clean Apple Silicon machines; do not claim Docker Metal inference.

### Phase 3 — Windows runtime adapter

- Keep the Web UI and Local Adapter interface unchanged.
- Build a private Python/CUDA runtime from a pinned Tencent Hunyuan3D commit and checkpoint revision.
- Prebuild custom rasterizer/renderer extensions; no student-side compilation.
- Add NVIDIA driver/VRAM checks and explicit unsupported states.
- Validate on clean Windows NVIDIA machines before packaging a student release.

### Phase 4 — Student packages

- Produce `JIC_YZUIC_Hunyuan3D-Mac.dmg` and `JIC_YZUIC_Hunyuan3D-Windows-Setup.exe`.
- Include private runtime, launcher, UI, adapter, repair/doctor actions, licenses, and manifests.
- Keep large model payloads separate from the application installer; support online download and offline import.
- Add code signing and release evidence after functional packaging is stable.

## First vertical-slice interface

The first implementation must prove these behaviours with the mock backend:

1. Application UI opens before a model is installed.
2. Model download changes `missing → downloading → ready` and persists across restarts.
3. Generate is disabled until both a photo and a ready model exist.
4. A multipart photo request creates a job.
5. SSE reports progress and completion.
6. The returned GLB is saved, downloadable, previewable, and listed in history.
7. Cancel and common error states are visible in the UI.
8. The Docker stack runs without host Python or Node installation.

## Verification commands

```bash
docker compose up --build -d
node tests/contract.mjs
docker compose down -v
```

The Mac and Windows native backends are separate verification gates; a passing mock contract test is not evidence that a real model or GPU runtime works.

## Current implementation status

Completed in the implementation pass:

- Docker Web UI with photo drop, model state, advanced controls, progress,
  GLB preview, download, output-folder action, and history.
- Local Adapter contract, model download/cancel state machine, SSE job stream,
  artifact metadata, controlled artifact URLs, and job cancellation.
- Mock backend that emits a valid GLB for repeatable tests.
- Production-like static Web server and `/api` proxy for packaged launches.
- Optional managed backend process seam plus Mac/Windows platform configs and
  launch harnesses.
- External model downloader process seam with real file-size progress,
  cancellation, retry, ready-state persistence, and atomic Windows `.partial`
  install handling.
- Mac launcher wired to the converted
  `ddalcu/Hunyuan3D-2.1-MLX-Serve-8bit` model, app-local MLX cache, single
  instance reopen behavior, native output-folder opening, and unload-on-finish
  behavior.
- Windows `runtime/backend/server.py` wrapper for Tencent's official pipeline,
  explicit CUDA/VRAM checks, lazy PBR loading, no silent texture fallback, and
  a private-runtime Hugging Face downloader.
- Real Mac adapter-to-MLX shape smoke test completed in the current
  development environment.

Still release-gated and intentionally not represented as complete by the mock:

- Signed/notarized Mac package, clean-machine model download, and release
  manifest/checksum audit.
- Pinned Windows private Python/PyTorch/CUDA runtime, bundled Tencent source and
  native extensions, NVIDIA hardware shape/texture smoke test, and
  clean-machine installer validation.
- Signed/notarized DMG and signed Windows installer on clean machines.
