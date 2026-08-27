#!/bin/sh
set -eu

APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
NODE="$APP_ROOT/runtime/node/bin/node"
ADAPTER_ENTRY="$APP_ROOT/adapter/src/server.mjs"
WEB_ENTRY="$APP_ROOT/web/server.mjs"
DIST_DIR="$APP_ROOT/web/dist"
BACKEND="$APP_ROOT/runtime/mlx-serve"
DATA_ROOT="${HOME}/Library/Application Support/JIC_YZUIC_Hunyuan3D-Mac"
MODEL_STORE="$DATA_ROOT/.mlx-serve/models"
MODEL_PATH="$MODEL_STORE/ddalcu/Hunyuan3D-2.1-MLX-Serve-8bit"
ADAPTER_PORT="${JIC_ADAPTER_PORT:-8787}"
WEB_PORT="${JIC_WEB_PORT:-4173}"
BACKEND_PORT="${JIC_BACKEND_PORT:-11234}"
LOG_DIR="$DATA_ROOT/logs"

if [ ! -x "$NODE" ]; then
  echo "Private Node runtime not found: $NODE"
  exit 1
fi
if [ ! -x "$BACKEND" ]; then
  echo "mlx-serve runtime not found: $BACKEND"
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "macOS curl is required to check the local service."
  exit 1
fi
if [ ! -f "$ADAPTER_ENTRY" ] || [ ! -f "$WEB_ENTRY" ] || [ ! -f "$DIST_DIR/index.html" ]; then
  echo "JIC_YZUIC_Hunyuan3D-Mac package is incomplete."
  exit 1
fi

# A second click should reopen the existing local app instead of starting a
# second adapter/backend on the same ports.
if curl --silent --show-error --fail --max-time 1 "http://127.0.0.1:${WEB_PORT}/api/health" | grep -q '"adapter":"jic-local-adapter"'; then
  open "http://127.0.0.1:${WEB_PORT}"
  exit 0
fi

mkdir -p "$MODEL_STORE" "$DATA_ROOT" "$LOG_DIR"

# Keep mlx-serve's model cache inside the app's user-data directory. This is
# process-local environment state; the launcher does not edit shell profiles
# or the system PATH.
export HOME="$DATA_ROOT"

BACKEND_ARGS_JSON=$(
  "$NODE" -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- \
    --serve --host 127.0.0.1 --port "$BACKEND_PORT" --model-dir "$MODEL_STORE"
)
MODEL_DOWNLOAD_ARGS_JSON=$(
  "$NODE" -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- \
    pull ddalcu/Hunyuan3D-2.1-MLX-Serve-8bit
)

cleanup() {
  [ -z "${WEB_PID:-}" ] || kill "$WEB_PID" 2>/dev/null || true
  [ -z "${ADAPTER_PID:-}" ] || kill "$ADAPTER_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

ADAPTER_PID=""
WEB_PID=""

export PORT="$ADAPTER_PORT"
export DATA_DIR="$DATA_ROOT"
export PLATFORM="macos-arm64"
export BACKEND_KIND="mlx-serve"
export BACKEND_PROTOCOL="mlx-native"
export JIC_NATIVE_RUNTIME="1"
export BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
export MODEL_DISPLAY_NAME="Hunyuan3D 2.1 (8-bit / MLX)"
export BACKEND_MODEL_TARGET="$MODEL_PATH"
export BACKEND_REQUEST_MODEL="Hunyuan3D-2.1-MLX-Serve-8bit"
export BACKEND_COMMAND="$BACKEND"
export BACKEND_ARGS_JSON
export BACKEND_WORKDIR="$APP_ROOT"
export MODEL_DOWNLOAD_COMMAND="$BACKEND"
export MODEL_DOWNLOAD_ARGS_JSON
export MODEL_DOWNLOAD_WORKDIR="$APP_ROOT"
export MODEL_EXPECTED_PATH="$MODEL_PATH"
export MODEL_TOTAL_BYTES="8100000000"
"$NODE" "$ADAPTER_ENTRY" >"$LOG_DIR/adapter.log" 2>&1 &
ADAPTER_PID=$!

export PORT="$WEB_PORT"
export DIST_DIR
export ADAPTER_URL="http://127.0.0.1:${ADAPTER_PORT}"
"$NODE" "$WEB_ENTRY" >"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!

echo "JIC_YZUIC_Hunyuan3D-Mac is starting."
echo "Logs: $LOG_DIR"
open "http://127.0.0.1:${WEB_PORT}"
wait "$WEB_PID"
