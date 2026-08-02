#!/usr/bin/env bash
#
# Launch Firefox Nightly against the dev server for WebGPU crash testing on
# Linux / AMD RDNA4 (GFX1201). See docs/audit/webgpu-firefox-linux-amd-rdna4.md.
#
# Playwright CANNOT drive Firefox Nightly (it only automates its own patched
# Firefox), so the RDNA4 crash path is exercised manually here. This script:
#   1. FULLY closes any running Firefox Nightly first — a clean GPU process is
#      essential, because a prior hard crash leaves requestAdapter() returning
#      null until a full restart.
#   2. Forces X11 mode (env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11), the audit's
#      workaround for the GFX1201 DMA-BUF submission crash.
#
# Usage:  ./launch-nightly.sh [url]        (default: https://localhost:3000/)
#         ./launch-nightly.sh --close      (just full-close, don't relaunch)
#         MOZ_LOG_WEBGPU=1 ./launch-nightly.sh   (verbose WebGPU logging)
#
# NOTE: the script name deliberately avoids the substring "firefox-nightly" so
# the pkill below can't match this script's own process.
set -uo pipefail

URL="${1:-https://localhost:3000/}"

full_close() {
  echo ">> Closing Firefox Nightly (and its GPU child processes)..."
  pkill -f firefox-nightly 2>/dev/null || true
  for _ in $(seq 1 30); do
    pgrep -f firefox-nightly >/dev/null 2>&1 || break
    sleep 0.5
  done
  pkill -9 -f firefox-nightly 2>/dev/null || true
  sleep 1
  if pgrep -f firefox-nightly >/dev/null 2>&1; then
    echo "!! Some firefox-nightly processes are still alive:"
    pgrep -af firefox-nightly
  else
    echo ">> All Firefox Nightly processes closed."
  fi
}

full_close

if [[ "$URL" == "--close" ]]; then
  exit 0
fi

LOG_ENV=()
if [[ "${MOZ_LOG_WEBGPU:-}" == "1" ]]; then
  LOG_ENV=(MOZ_LOG="webgpu:5,gfx:5")
  echo ">> WebGPU MOZ_LOG enabled."
fi

echo ">> Launching Firefox Nightly (X11 mode) -> $URL"
env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 "${LOG_ENV[@]}" \
  firefox-nightly "$URL" >/tmp/firefox-nightly-webgpu.log 2>&1 &

sleep 3
echo ">> Window protocol should read x11 in about:support. Live processes:"
pgrep -af firefox-nightly | head -5
echo ">> stdout/stderr: /tmp/firefox-nightly-webgpu.log"
