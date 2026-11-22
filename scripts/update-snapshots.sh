#!/usr/bin/env bash
# Regenerates the VRT snapshots (chromium/firefox/webkit on Linux) inside the Playwright
# container so they match CI. Use it when the rendering or Playwright changes.
#
#   ./scripts/update-snapshots.sh
#
# Requires a running Docker daemon (colima works).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAYWRIGHT_VERSION="$(node -p "require('$REPO_ROOT/package.json').devDependencies['@playwright/test']")"
PNPM_VERSION="$(node -p "require('$REPO_ROOT/package.json').packageManager.split('@')[1]")"
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"
# Run natively (an emulated amd64 container crashes pnpm under qemu).
case "$(uname -m)" in
  arm64 | aarch64) PLATFORM=linux/arm64 ;;
  *) PLATFORM=linux/amd64 ;;
esac

echo "Using image: $IMAGE ($PLATFORM)" >&2

# node_modules is kept in a container volume so the host's macOS binaries are not reused.
# Note: on Apple Silicon this runs linux/arm64 while CI runs on x86_64. Rendering has matched so far;
# if CI reports small diffs, regenerate the snapshots from the CI artifacts instead.
docker run --rm \
  --platform "$PLATFORM" \
  -v "$REPO_ROOT:/work" \
  -v "kusa-image-node-modules-${PLATFORM#linux/}:/work/node_modules" \
  -w /work \
  -e CI=true \
  "$IMAGE" \
  bash -euo pipefail -c "
    npm install -g pnpm@${PNPM_VERSION} >/dev/null
    pnpm install --frozen-lockfile
    pnpm test:vrt --update-snapshots
  "
