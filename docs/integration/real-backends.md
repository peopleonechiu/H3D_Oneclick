# Real backend integration

The Web UI only talks to the Local Adapter. The adapter is the compatibility
layer for both platforms; it must not make the browser know whether the local
engine is MLX or CUDA.

## Shared backend contract

For the MLX-compatible backend the adapter sends this request to the configured
backend:

```json
{
  "model": "<BACKEND_REQUEST_MODEL>",
  "image": "<base64 image bytes>",
  "steps": 30,
  "guidance_scale": 5,
  "octree_resolution": 256,
  "seed": 42,
  "texture": false,
  "stream": true
}
```

The backend returns Server-Sent Events. `progress` events are normalized into
the adapter's `/api/jobs/{jobId}/events` stream, and the final `complete` event
contains a base64 GLB. The adapter owns the output file and exposes only a
stable download URL to the browser.

## macOS / mlx-serve

`config/platforms/macos-arm64.json` is the launch configuration for the native
Apple Silicon path. The launcher resolves `runtime/mlx-serve` and
`$DATA_ROOT/.mlx-serve/models` to absolute paths, then passes them to the
adapter through:

- `BACKEND_COMMAND`
- `BACKEND_ARGS_JSON`
- `BACKEND_URL`
- `BACKEND_MODEL_TARGET`
- `BACKEND_REQUEST_MODEL`
- `MODEL_DOWNLOAD_COMMAND` / `MODEL_DOWNLOAD_ARGS_JSON`
- `MODEL_EXPECTED_PATH`

The adapter's managed-process seam is optional. Docker leaves
`BACKEND_COMMAND` unset and runs the mock as a separate service; the packaged
Mac application supplies it and keeps the same adapter process.

`mlx-serve`'s Hunyuan3D engine consumes the converted model
`ddalcu/Hunyuan3D-2.1-MLX-Serve-8bit`; the Tencent checkpoint is not copied
verbatim into the MLX model directory. The app downloads that converted bundle
after the application itself has started, verifies that the command completed
and that the expected model directory exists, then writes its ready marker.
The downloader's `HOME` is scoped to the app process so the student's existing
MLX store is not changed.

The current native MLX engine exposes shape generation; its source describes
the paint/texture phase as a later seam. Therefore the adapter does not enable
PBR on the Mac path merely because the converted bundle contains a `paint`
directory. It requires an explicit backend texture capability, which the
current `mlx-serve` release does not report.

Relevant upstream endpoints are `/health`, `/v1/models`,
`/v1/models/rescan`, `/v1/load-model`, `/v1/unload-model`, and
`/v1/3d/generations`.

The native Mac path has been smoke-tested in the development environment with
an installed 8-bit model: the adapter reached ready, submitted a real image,
received streamed MLX progress, saved a 1.3 MB GLB, and unloaded the model
when `keepModelLoaded` was false. This is not yet a signed DMG or clean-machine
release test.

The first-run UI reflects this runtime split: Mac offers the converted MLX
model download immediately, while Windows checks the NVIDIA/CUDA hardware
state before enabling its checkpoint download. This is an onboarding gate, not
just a translated label; the adapter remains the shared protocol boundary after
the download completes.

## Windows / private CUDA runtime

`config/platforms/windows-x64-cuda.json` describes the student package seam.
`runtime/python/python.exe` is private to the package; the student does not
install Python, CUDA Toolkit, PyTorch, or custom rasterizer extensions. The
launcher starts `runtime/backend/server.py` and uses
`runtime/backend/download_model.py` for the post-launch checkpoint download.

The Windows backend wrapper must present the same `/health`, model lifecycle,
and streaming `/v1/3d/generations` contract. It translates the stable adapter
request into Tencent's official Hunyuan3D Python pipeline internally. The
adapter's `official-hunyuan` protocol maps the wrapper's synchronous
`/generate` file response back into the same adapter job/SSE interface used by
the Mac path. The wrapper reports unsupported GPU/VRAM states before accepting
a job and never falls back to CPU silently.

The Windows wrapper deliberately uses an atomic `.partial` model directory.
An interrupted Hugging Face download can be resumed, but it cannot become a
ready model until the downloader exits successfully and the final directory is
renamed into place.

## What is intentionally not claimed yet

- The Docker mock proves UI and protocol behavior only; it is not a model or
  GPU smoke test.
- The checked-in platform JSON and launch scripts are a package seam, not a
  student release by themselves.
- Mac real inference is verified on the current development Mac, but a release
  still requires the converted MLX bundle, code signing/notarization, and clean
  Apple Silicon validation.
- The Windows wrapper and downloader are implemented and syntax-checked, but a
  release still requires a pinned private runtime, prebuilt native extensions,
  NVIDIA-driver checks, a real shape/texture smoke test, and clean-machine
  validation.
