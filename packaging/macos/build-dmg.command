#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
PAYLOAD="${1:-$PROJECT_ROOT/release/macos/payload}"
OUTPUT_DIR="${2:-$PROJECT_ROOT/release/installers}"
STAGE=$(mktemp -d "${TMPDIR:-/tmp}/jic-hunyuan3d-dmg.XXXXXX")
APP="$STAGE/JIC_YZUIC_Hunyuan3D-Mac.app"
OUTPUT="$OUTPUT_DIR/JIC_YZUIC_Hunyuan3D-Mac.dmg"

cleanup() { rm -rf "$STAGE"; }
trap cleanup INT TERM EXIT

if [ ! -d "$PAYLOAD" ]; then
  echo "Mac payload not found: $PAYLOAD"
  echo "Run packaging/macos/build-payload.command first."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required on the build machine to verify the payload."
  exit 1
fi
node "$PROJECT_ROOT/packaging/verify-payload.mjs" macos "$PAYLOAD"

mkdir -p "$APP/Contents/Resources" "$APP/Contents/MacOS" "$OUTPUT_DIR"
cp -R "$PAYLOAD"/. "$APP/Contents/Resources/"
cp "$PROJECT_ROOT/packaging/macos/app-wrapper/Contents/Info.plist" "$APP/Contents/Info.plist"
cp "$PROJECT_ROOT/packaging/macos/app-wrapper/Contents/MacOS/JIC_YZUIC_Hunyuan3D-Mac" "$APP/Contents/MacOS/JIC_YZUIC_Hunyuan3D-Mac"
chmod +x "$APP/Contents/MacOS/JIC_YZUIC_Hunyuan3D-Mac" "$APP/Contents/Resources/packaging/macos/launch.command"

SIGNING_IDENTITY="${JIC_CODESIGN_IDENTITY:--}"
while IFS= read -r dylib; do
  codesign --force --sign "$SIGNING_IDENTITY" "$dylib"
done <<EOF
$(find "$APP/Contents/Resources/runtime" -type f -name '*.dylib' -print)
EOF
codesign --force --options runtime --entitlements "$PROJECT_ROOT/packaging/macos/node.entitlements" --sign "$SIGNING_IDENTITY" "$APP/Contents/Resources/runtime/node/bin/node"
codesign --force --options runtime --sign "$SIGNING_IDENTITY" "$APP/Contents/Resources/runtime/mlx-serve"
codesign --force --options runtime --sign "$SIGNING_IDENTITY" "$APP"
codesign --verify --deep --strict "$APP"

hdiutil create -volname "JIC_YZUIC_Hunyuan3D-Mac" -srcfolder "$STAGE" -ov -format UDZO "$OUTPUT"
echo "Created $OUTPUT"
