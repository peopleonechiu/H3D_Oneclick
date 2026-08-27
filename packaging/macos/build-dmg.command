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
  echo "Stage the completed private runtime under release/macos/payload first."
  exit 1
fi

mkdir -p "$APP/Contents/Resources" "$OUTPUT_DIR"
cp -R "$PAYLOAD"/. "$APP/Contents/Resources/"
cp "$PROJECT_ROOT/packaging/macos/app-wrapper/Contents/Info.plist" "$APP/Contents/Info.plist"
cp "$PROJECT_ROOT/packaging/macos/app-wrapper/Contents/MacOS/JIC_YZUIC_Hunyuan3D-Mac" "$APP/Contents/MacOS/JIC_YZUIC_Hunyuan3D-Mac"
chmod +x "$APP/Contents/MacOS/JIC_YZUIC_Hunyuan3D-Mac" "$APP/Contents/Resources/packaging/macos/launch.command"

if [ -n "${JIC_CODESIGN_IDENTITY:-}" ]; then
  codesign --deep --force --options runtime --sign "$JIC_CODESIGN_IDENTITY" "$APP"
fi

hdiutil create -volname "JIC_YZUIC_Hunyuan3D-Mac" -srcfolder "$STAGE" -ov -format UDZO "$OUTPUT"
echo "Created $OUTPUT"
