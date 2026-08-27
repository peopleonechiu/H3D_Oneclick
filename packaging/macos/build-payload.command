#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
VERSIONS_FILE="$PROJECT_ROOT/packaging/versions.json"
PAYLOAD="${1:-$PROJECT_ROOT/release/macos/payload}"
CACHE_ROOT="${JIC_BUILD_CACHE:-${TMPDIR:-/tmp}/jic-hunyuan3d-cache}"
WORK_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/jic-hunyuan3d-build.XXXXXX")
STAGED_PAYLOAD="$WORK_ROOT/payload"

cleanup() { rm -rf "$WORK_ROOT"; }
trap cleanup INT TERM EXIT

if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
  echo "Mac payload builder requires an Apple Silicon Mac."
  exit 1
fi

for command_name in curl shasum tar node npm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required build tool is missing: $command_name"
    exit 1
  fi
done

json_value() {
  node -e 'const fs = require("node:fs"); const [file, key] = process.argv.slice(1); let value = JSON.parse(fs.readFileSync(file, "utf8")); for (const part of key.split(".")) value = value[part]; console.log(value);' "$VERSIONS_FILE" "$1"
}

download_verified() {
  url="$1"
  expected_sha="$2"
  target="$3"
  mkdir -p "$(dirname -- "$target")"
  if [ -f "$target" ] && [ "$(shasum -a 256 "$target" | awk '{print $1}')" = "$expected_sha" ]; then
    return
  fi
  curl -L --fail --silent --show-error "$url" -o "$target"
  actual_sha=$(shasum -a 256 "$target" | awk '{print $1}')
  if [ "$actual_sha" != "$expected_sha" ]; then
    echo "Checksum mismatch for $target"
    echo "Expected: $expected_sha"
    echo "Actual:   $actual_sha"
    exit 1
  fi
}

NODE_VERSION=$(json_value node.version)
NODE_ARCHIVE=$(json_value node.macosArm64.archive)
NODE_SHA256=$(json_value node.macosArm64.sha256)
MLX_VERSION=$(json_value mlxServe.version)
MLX_ARCHIVE=$(json_value mlxServe.archive)
MLX_SHA256=$(json_value mlxServe.sha256)

mkdir -p "$CACHE_ROOT" "$STAGED_PAYLOAD"

NODE_URL="https://nodejs.org/dist/$NODE_VERSION/$NODE_ARCHIVE"
NODE_TARBALL="$CACHE_ROOT/$NODE_ARCHIVE"
download_verified "$NODE_URL" "$NODE_SHA256" "$NODE_TARBALL"
mkdir -p "$WORK_ROOT/node"
tar -xzf "$NODE_TARBALL" -C "$WORK_ROOT/node"
NODE_ROOT=$(find "$WORK_ROOT/node" -mindepth 1 -maxdepth 1 -type d -print -quit)
if [ -z "$NODE_ROOT" ]; then
  echo "Node archive has no top-level directory."
  exit 1
fi
mkdir -p "$STAGED_PAYLOAD/runtime/node"
mkdir -p "$STAGED_PAYLOAD/runtime/node/bin"
cp "$NODE_ROOT/bin/node" "$STAGED_PAYLOAD/runtime/node/bin/node"
cp "$NODE_ROOT/LICENSE" "$STAGED_PAYLOAD/runtime/node/LICENSE"
cp "$NODE_ROOT/README.md" "$STAGED_PAYLOAD/runtime/node/README.md"

MLX_URL="https://github.com/ddalcu/mlx-serve/releases/download/$MLX_VERSION/$MLX_ARCHIVE"
MLX_TARBALL="$CACHE_ROOT/$MLX_ARCHIVE"
download_verified "$MLX_URL" "$MLX_SHA256" "$MLX_TARBALL"
mkdir -p "$WORK_ROOT/mlx"
tar -xzf "$MLX_TARBALL" -C "$WORK_ROOT/mlx"
MLX_ROOT=$(find "$WORK_ROOT/mlx" -mindepth 1 -maxdepth 1 -type d -print -quit)
if [ -z "$MLX_ROOT" ] || [ ! -f "$MLX_ROOT/mlx-serve" ]; then
  echo "mlx-serve archive is missing its executable."
  exit 1
fi
mkdir -p "$STAGED_PAYLOAD/runtime/lib"
cp "$MLX_ROOT/mlx-serve" "$STAGED_PAYLOAD/runtime/mlx-serve"
cp -R "$MLX_ROOT/lib"/. "$STAGED_PAYLOAD/runtime/lib"/
cp "$MLX_ROOT/LICENSE" "$STAGED_PAYLOAD/runtime/LICENSE"
cp "$MLX_ROOT/LICENSE-APACHE-2.0" "$STAGED_PAYLOAD/runtime/LICENSE-APACHE-2.0"
cp "$MLX_ROOT/NOTICE" "$STAGED_PAYLOAD/runtime/NOTICE"
chmod +x "$STAGED_PAYLOAD/runtime/mlx-serve" "$STAGED_PAYLOAD/runtime/node/bin/node"

WEB_BUILD="$WORK_ROOT/web"
cp -R "$PROJECT_ROOT/web" "$WEB_BUILD"
(
  cd "$WEB_BUILD"
  export PATH="$NODE_ROOT/bin:$PATH"
  npm install --ignore-scripts --no-audit --no-fund --no-package-lock
  npm run build
)

mkdir -p "$STAGED_PAYLOAD/web" "$STAGED_PAYLOAD/adapter/src" "$STAGED_PAYLOAD/packaging/macos"
cp "$WEB_BUILD/server.mjs" "$STAGED_PAYLOAD/web/server.mjs"
cp -R "$WEB_BUILD/dist" "$STAGED_PAYLOAD/web/dist"
cp "$PROJECT_ROOT/adapter/package.json" "$STAGED_PAYLOAD/adapter/package.json"
cp "$PROJECT_ROOT/adapter/src/server.mjs" "$STAGED_PAYLOAD/adapter/src/server.mjs"
cp "$PROJECT_ROOT/adapter/src/backend-process.mjs" "$STAGED_PAYLOAD/adapter/src/backend-process.mjs"
cp "$PROJECT_ROOT/packaging/macos/launch.command" "$STAGED_PAYLOAD/packaging/macos/launch.command"
(
  cd "$STAGED_PAYLOAD/adapter"
  export PATH="$NODE_ROOT/bin:$PATH"
  npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock
)

SOURCE_COMMIT=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)
node -e 'const fs = require("node:fs"); const [file, output, commit] = process.argv.slice(1); const versions = JSON.parse(fs.readFileSync(file, "utf8")); fs.writeFileSync(output, JSON.stringify({ applicationVersion: versions.applicationVersion, sourceCommit: commit, node: versions.node.version, mlxServe: versions.mlxServe.version }, null, 2) + "\n");' "$VERSIONS_FILE" "$STAGED_PAYLOAD/runtime/build-info.json" "$SOURCE_COMMIT"

node "$PROJECT_ROOT/packaging/verify-payload.mjs" macos "$STAGED_PAYLOAD"
mkdir -p "$(dirname -- "$PAYLOAD")"
rm -rf "$PAYLOAD"
mv "$STAGED_PAYLOAD" "$PAYLOAD"
echo "Mac payload staged at $PAYLOAD"
