#!/usr/bin/env bash
set -euo pipefail
bundle=src-tauri/target/universal-apple-darwin/release/bundle
dmg=$(find "$bundle/dmg" -maxdepth 1 -name '*.dmg' -print -quit)
test -n "$dmg"
mount_dir=$(mktemp -d)
trap 'hdiutil detach "$mount_dir" >/dev/null 2>&1 || true; rmdir "$mount_dir"' EXIT
hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg"
app=$(find "$mount_dir" -maxdepth 1 -name '*.app' -print -quit)
test -n "$app"
codesign --verify --deep --strict --verbose=2 "$app"
codesign -dv --verbose=4 "$app" 2>&1 | grep -F 'Authority=Developer ID Application:'
spctl --assess --type execute --verbose=4 "$app"
xcrun stapler validate "$app"
architectures=$(lipo -archs "$app/Contents/MacOS/open-geo-studio")
for arch in x86_64 arm64; do [[ " $architectures " == *" $arch "* ]]; done
