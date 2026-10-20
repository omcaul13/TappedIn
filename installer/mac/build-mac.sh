#!/usr/bin/env bash
# Builds dist/TappedIn.dmg and dist/TappedIn-mac.zip: one universal (Apple Silicon + Intel) TappedIn.app.
# The Mac counterpart of scripts/build-installer.ps1, on a Mac with Xcode's command line tools.
#   bash installer/mac/build-mac.sh [--unsigned]
#   --unsigned   skip castLabs' Widevine (VMP) signing: a test build, video will not play
#
# The app is castLabs' Electron.app (arm64 + x64 merged), renamed TappedIn, with this repo's committed
# files (git archive HEAD), their node_modules and a universal Node inside Contents/Resources/app.
#
# Order matters: castLabs VMP signing changes the Electron framework, so it comes after packaging and
# before Apple's code signature, which seals every file (VMP after codesign breaks the seal; codesign
# after VMP is what castLabs documents).
#
# Apple signing, from the environment (release-mac.yml sets these only when the secrets exist):
#   MAC_SIGN_IDENTITY  unset: Mode A, an ad hoc signature (runs on Apple Silicon; Gatekeeper asks once).
#                      "Developer ID Application: …": Mode B, hardened runtime + entitlements.plist.
#   Mode B notarizes too, with an App Store Connect API key (APPLE_API_KEY_PATH, APPLE_API_KEY_ID,
#   APPLE_API_ISSUER) or an Apple ID (APPLE_ID, APPLE_APP_PASSWORD, APPLE_TEAM_ID).
# VMP signing needs a castLabs EVS login: EVS_ACCOUNT_NAME / EVS_PASSWD in the environment (as on Windows).
set -euo pipefail

UNSIGNED=0
[[ "${1:-}" == "--unsigned" ]] && UNSIGNED=1

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BUILD="$ROOT/build/mac"
DIST="$ROOT/dist"
STAGE="$BUILD/stage"
OUT="$BUILD/out"
APP="$OUT/TappedIn.app"
BUNDLE_ID="io.github.omcaul13.tappedin"
IDENTITY="${MAC_SIGN_IDENTITY:-}"

# Node bundled into the app (same version as the Windows installer). Hashes from
# https://nodejs.org/dist/v24.20.0/SHASUMS256.txt
NODE_VERSION="v24.20.0"
NODE_SHA_arm64="40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8"
NODE_SHA_x64="9e5b2644cf107befb6aefca676b96d3296bc10138096f022ed378d6233ed81f4"

step() { printf '\n\033[36m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
sha_ok() { [[ "$(shasum -a 256 "$1" | cut -d' ' -f1)" == "$2" ]]; }
[[ "$(uname)" == "Darwin" ]] || die "build-mac.sh runs on macOS only."

cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"
# CFBundleShortVersionString must be numbers only: 0.1.0-beta.2 -> 0.1.0 (the app shows the full version).
SHORT_VERSION="${VERSION%%-*}"
if [[ -n "$IDENTITY" ]]; then MODE=B; UPDATES=auto; else MODE=A; UPDATES=notice; fi
echo "Building TappedIn $VERSION for macOS (Mode $MODE$([[ $UNSIGNED == 1 ]] && echo ', no VMP signature'))"
rm -rf "$BUILD" && mkdir -p "$STAGE" "$OUT" "$DIST"

# 1. Stage the committed files ----------------------------------------------------------------------
step "1/8  Staging the committed files (git archive HEAD)"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || echo "   Note: uncommitted changes are not included; commit them first to ship them."
git archive HEAD | tar -x -C "$STAGE"

# 2. Dependencies -----------------------------------------------------------------------------------
step "2/8  App dependencies (npm ci in the stage)"
(cd "$STAGE" && TAPPEDIN_INSTALLER=1 npm ci --no-audit --no-fund)
# npm installs only this Mac's esbuild binary; the universal app needs both (Node runs as either).
ESBUILD="$(node -p "require('$STAGE/node_modules/esbuild/package.json').version")"
for arch in arm64 x64; do
  dir="$STAGE/node_modules/@esbuild/darwin-$arch"
  [[ -d "$dir" ]] && continue
  (cd "$BUILD" && npm pack --silent "@esbuild/darwin-$arch@$ESBUILD" >/dev/null)
  mkdir -p "$dir" && tar -xzf "$BUILD/esbuild-darwin-$arch-$ESBUILD.tgz" -C "$dir" --strip-components=1
done
ELECTRON="$(node -p "require('$STAGE/node_modules/electron/package.json').version")"
CHECKSUMS="$STAGE/node_modules/electron/checksums.json"
# What the Windows installer leaves out, plus Electron's npm wrapper (the app is Electron itself here).
rm -rf "$STAGE"/{test,docs,.github,installer,website} "$STAGE"/*.cmd "$STAGE/node_modules/electron/dist"
cp "$CHECKSUMS" "$BUILD/electron-checksums.json"
rm -rf "$STAGE/node_modules/electron"
cp "$HERE/entry.cjs" "$STAGE/electron/mac-entry.cjs"
node -e '
  const fs = require("fs"); const f = process.argv[1]; const p = JSON.parse(fs.readFileSync(f, "utf8"));
  p.main = "electron/mac-entry.cjs"; p.productName = "TappedIn"; p.tappedin = { ...(p.tappedin || {}), macUpdates: process.argv[2] };
  fs.writeFileSync(f, JSON.stringify(p, null, 2) + "\n");' "$STAGE/package.json" "$UPDATES"

# 3. Universal Electron ------------------------------------------------------------------------------
step "3/8  castLabs Electron $ELECTRON, Apple Silicon + Intel"
for arch in arm64 x64; do
  zip="electron-v$ELECTRON-darwin-$arch.zip"
  sha="$(node -p "require('$BUILD/electron-checksums.json')['$zip'] || ''")"
  [[ -n "$sha" ]] || die "No checksum for $zip in castLabs' checksums.json."
  curl -fsSL -o "$BUILD/$zip" "https://github.com/castlabs/electron-releases/releases/download/v${ELECTRON/+/%2B}/${zip/+/%2B}"
  sha_ok "$BUILD/$zip" "$sha" || die "$zip does not match castLabs' checksum."
  mkdir -p "$BUILD/electron-$arch" && ditto -x -k "$BUILD/$zip" "$BUILD/electron-$arch"
  # castLabs' development VMP signatures differ per architecture; the merge needs identical plain files,
  # and step 5 signs the universal framework anyway.
  find "$BUILD/electron-$arch/Electron.app" -name '*.sig' -delete
  # @electron/universal merges apps, so it wants each to have one; step 4 puts the real one in.
  mkdir -p "$BUILD/electron-$arch/Electron.app/Contents/Resources/app"
  echo '{"name":"placeholder"}' > "$BUILD/electron-$arch/Electron.app/Contents/Resources/app/package.json"
done
(cd "$HERE" && npm ci --no-audit --no-fund --silent)
node "$HERE/tools.mjs" universal "$BUILD/electron-x64/Electron.app" "$BUILD/electron-arm64/Electron.app" "$BUILD/Electron.app"

# 4. Universal Node + the app bundle ----------------------------------------------------------------
step "4/8  Node $NODE_VERSION (universal) and TappedIn.app"
for arch in arm64 x64; do
  tgz="node-$NODE_VERSION-darwin-$arch.tar.gz"
  curl -fsSL -o "$BUILD/$tgz" "https://nodejs.org/dist/$NODE_VERSION/$tgz"
  sha_var="NODE_SHA_$arch"
  sha_ok "$BUILD/$tgz" "${!sha_var}" || die "$tgz does not match its published SHA256; do not ship this build."
  tar -xzf "$BUILD/$tgz" -C "$BUILD"
done
mkdir -p "$STAGE/runtime"
lipo -create -output "$STAGE/runtime/node" "$BUILD/node-$NODE_VERSION-darwin-arm64/bin/node" "$BUILD/node-$NODE_VERSION-darwin-x64/bin/node"
cp "$BUILD/node-$NODE_VERSION-darwin-arm64/LICENSE" "$STAGE/runtime/LICENSE"

ditto "$BUILD/Electron.app" "$APP"
RES="$APP/Contents/Resources"
rm -rf "$RES/default_app.asar" "$RES/electron.icns" "$RES/app"
ditto "$STAGE" "$RES/app"
ICONSET="$BUILD/TappedIn.iconset" && mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$HERE/icon-1024.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$HERE/icon-1024.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns -o "$RES/TappedIn.icns" "$ICONSET"
PLIST="$APP/Contents/Info.plist"
plutil -replace CFBundleName -string TappedIn "$PLIST"
plutil -replace CFBundleDisplayName -string TappedIn "$PLIST"
plutil -replace CFBundleIdentifier -string "$BUNDLE_ID" "$PLIST"
plutil -replace CFBundleShortVersionString -string "$SHORT_VERSION" "$PLIST"
plutil -replace CFBundleVersion -string "$SHORT_VERSION" "$PLIST"
plutil -replace CFBundleIconFile -string TappedIn.icns "$PLIST"
plutil -replace LSApplicationCategoryType -string public.app-category.sports "$PLIST"
plutil -replace NSHumanReadableCopyright -string "TappedIn $VERSION" "$PLIST"
MIN_MACOS="$(plutil -extract LSMinimumSystemVersion raw "$PLIST")"
echo "   TappedIn.app: $BUNDLE_ID $VERSION, macOS $MIN_MACOS or later"

# 5. Widevine (VMP) signature -----------------------------------------------------------------------
step "5/8  castLabs VMP signature for Widevine (before Apple signing)"
EVS=(python3 -I "$ROOT/scripts/evs.py" vmp)
if [[ $UNSIGNED == 1 ]]; then
  printf '   \033[33mUNSIGNED TEST BUILD: video will not play in this app.\033[0m\n'
else
  "${EVS[@]}" sign-pkg "$OUT" || die "castLabs EVS signing failed. Set EVS_ACCOUNT_NAME / EVS_PASSWD (or sign in with: python3 -I scripts/evs.py account reauth), or build with --unsigned."
  "${EVS[@]}" -n verify-pkg "$OUT" >/dev/null || die "The app has no streaming VMP signature (castLabs' development one does not play video)."
  echo "   castLabs' check: streaming signature."
fi

# 6. Apple code signature ---------------------------------------------------------------------------
step "6/8  Apple code signature ($([[ $MODE == B ]] && echo "Developer ID, hardened runtime" || echo "ad hoc"))"
node "$HERE/tools.mjs" sign "$APP" "${IDENTITY:--}" "$HERE/entitlements.plist"
codesign --verify --deep --strict --verbose=2 "$APP"

# 7. Notarization (Mode B) --------------------------------------------------------------------------
notarize() {
  if [[ -n "${APPLE_API_KEY_PATH:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
    xcrun notarytool submit "$1" --wait --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER"
  elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
    xcrun notarytool submit "$1" --wait --apple-id "$APPLE_ID" --password "$APPLE_APP_PASSWORD" --team-id "$APPLE_TEAM_ID"
  else
    return 1
  fi
}
step "7/8  Notarization"
NOTARIZED=0
if [[ $MODE == A ]]; then
  echo "   Mode A: skipped (no Apple Developer ID)."
else
  ditto -c -k --keepParent "$APP" "$BUILD/notarize.zip"
  if notarize "$BUILD/notarize.zip"; then
    xcrun stapler staple "$APP" && NOTARIZED=1
  else
    die "Mode B needs notarization credentials: APPLE_API_KEY_PATH + APPLE_API_KEY_ID + APPLE_API_ISSUER, or APPLE_ID + APPLE_APP_PASSWORD + APPLE_TEAM_ID."
  fi
fi

# 8. Disk image and update zip ----------------------------------------------------------------------
step "8/8  TappedIn.dmg and TappedIn-mac.zip"
DMG_DIR="$BUILD/dmg" && mkdir -p "$DMG_DIR"
ditto "$APP" "$DMG_DIR/TappedIn.app"
ln -s /Applications "$DMG_DIR/Applications"
rm -f "$DIST/TappedIn.dmg" "$DIST/TappedIn-mac.zip"
hdiutil create -volname TappedIn -srcfolder "$DMG_DIR" -fs HFS+ -format UDZO -ov "$DIST/TappedIn.dmg" >/dev/null
if [[ $MODE == B ]]; then
  codesign --sign "$IDENTITY" --timestamp "$DIST/TappedIn.dmg"
  notarize "$DIST/TappedIn.dmg" && xcrun stapler staple "$DIST/TappedIn.dmg"
fi
# Squirrel.Mac (Mode B updates) takes a zip of the app.
ditto -c -k --sequesterRsrc --keepParent "$APP" "$DIST/TappedIn-mac.zip"
node -e '
  const [version, minimumSystemVersion, mode, vmp, notarized] = process.argv.slice(1);
  require("fs").writeFileSync("dist/mac-info.json", JSON.stringify({ version, minimumSystemVersion, mode, vmpSigned: vmp === "1", notarized: notarized === "1" }, null, 2) + "\n");' \
  "$VERSION" "$MIN_MACOS" "$MODE" "$((1 - UNSIGNED))" "$NOTARIZED"

echo
echo "Universal check:"
for f in "$APP/Contents/MacOS/Electron" "$RES/app/runtime/node" "$RES/app/node_modules/@esbuild/darwin-arm64/bin/esbuild" "$RES/app/node_modules/@esbuild/darwin-x64/bin/esbuild"; do
  echo "   $(lipo -archs "$f")  ${f#"$OUT/"}"
done
lipo -archs "$APP/Contents/MacOS/Electron" | grep -q 'x86_64 arm64\|arm64 x86_64' || die "The app is not universal."
ls -l "$DIST/TappedIn.dmg" "$DIST/TappedIn-mac.zip"
echo "Done (Mode $MODE)."
