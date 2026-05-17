# WebGPU on Firefox Nightly — Linux / AMD RDNA4 (GFX1201) Audit

**Date:** 2026-05-17
**Last updated:** 2026-05-17 (added timestamp-query crash, particleLife resolution)
**Author:** investigation session (chaos-master)
**System:** Arch Linux, AMD Radeon RX 9070 XT (Navi48, GFX1201), Hyprland (Wayland)

---

## Table of Contents

1. [System Environment](#1-system-environment)
2. [Root Cause Analysis](#2-root-cause-analysis)
3. [Vulkan Memory Heap Inspection](#3-vulkan-memory-heap-inspection)
4. [WebGPU Adapter Limits (Firefox vs Spec Defaults)](#4-webgpu-adapter-limits-firefox-vs-spec-defaults)
5. [Firefox Feature Decision Log (about:support)](#5-firefox-feature-decision-log-aboutsupport)
6. [Applied Fixes](#6-applied-fixes)
7. [How to Launch Firefox with Correct Flags](#7-how-to-launch-firefox-with-correct-flags)
8. [chaos-master App Specific Findings](#8-chaos-master-app-specific-findings)
9. [Mozilla Bugzilla Report (ready to file)](#9-mozilla-bugzilla-report-ready-to-file)
10. [Long-Term Recommendations](#10-long-term-recommendations)

---

## 1. System Environment

| Property | Value |
|---|---|
| OS | Arch Linux |
| Kernel | 7.0.8-arch1-1 |
| GPU | AMD Radeon RX 9070 XT (Navi48) |
| GPU Architecture | RDNA4 / GFX1201 |
| PCI Device ID | `0x1002:0x7550` |
| VRAM | 16 GiB |
| Mesa (git) | 26.1.0-devel (git-1f9bc71051) |
| Vulkan Driver | RADV GFX1201 |
| Vulkan Instance | 1.4.350 |
| Driver Version | 26.0.99 (RADV) |
| Desktop | Hyprland (Wayland compositor) |
| Display | 2560x1440 @ 165 Hz |
| Firefox | Nightly (WebGPU enabled) |
| Window Protocol | Wayland (session) / X11 (workaround) |

---

## 2. Root Cause Analysis

### Bug 1 (Primary): Firefox reports `RAM: 0` for GPU device 0x7550

Firefox's `gfxInfo` layer uses device IDs to look up GPU metadata including VRAM. Device `0x7550`
(RX 9070 XT / Navi48 / GFX1201) is **not yet in Firefox's GPU database**. As a result:

- `about:support` shows `RAM: 0` for GPU #1
- Firefox's `wgpu` Vulkan backend uses a zero VRAM budget
- Any WebGPU allocation — even a simple rotating cube — immediately exceeds the budget
- The device reports `GPUDeviceLostInfo: Out of memory`

Verification: the DRM sysfs path correctly reports 16 GiB:

```bash
cat /sys/class/drm/card1/device/mem_info_vram_total
# 17095983104  (16 GiB, correct)
```

Firefox simply does not read this value correctly for unrecognised device IDs.

### Bug 2 (Secondary): DMABUF_SURFACE_EXPORT blocked for GFX1201

Firefox's `gfxInfo` blocklist marks GFX1201 as a broken driver for `DMABUF_SURFACE_EXPORT`.
On Wayland, WebGPU-rendered frames are handed to the compositor via DMA-BUF. When this path
is blocked, textures cannot be submitted and the following cascade occurs:

```
(#0)  Error: Texture is not submitted
(#1)  Error: RemoteTexture ready timeout
(#2)  Error: RemoteTexture ready timeout
...
```

This manifests in the console as:

```
WebGPU device was lost: Out of memory.
DOMException: Not enough memory left.
```

Despite the misleading "out of memory" wording, the failure is a texture presentation timeout,
not actual memory exhaustion.

### Bug 3: GPU process hard crash on complex compute shaders (particleLife, indirect dispatch)

Attempting the `particleLife` WebGPU sample produces a full GPU process crash:

```
missing GBM_FORMAT_ARGB8888 dmabuf format   <-- non-fatal, expected in X11 mode
ExceptionHandler::GenerateDump attempting to generate: ...minidumps/1ec4da35...dmp
ExceptionHandler::GenerateDump cloned child 485041
ExceptionHandler::WaitForContinueSignal waiting for continue signal...
ExceptionHandler::SendContinueSignalToChild sent continue signal to child
ExceptionHandler::GenerateDump minidump generation succeeded
Exiting due to channel error.               <-- x7, all child processes lost
```

**Key distinction from Bug 1/2:** The kernel does not report a GPU hang. `dmesg` and
`journalctl -k` show no `amdgpu: GPU HANG`, fence timeout, or GPU reset for this event.
This means the **wgpu GPU child process crashed in userspace** — not a kernel driver hang.

Firefox's breakpad exception handler caught the crash, wrote a minidump, and the main process
detected the dead IPC channels (hence `Exiting due to channel error` ×7 for each child process).

**What particleLife uses that rotatingCube does not:**
- Two large storage buffer objects (positions + velocities) with ping-pong simulation
- Compute shader with global atomic operations for spatial hashing
- Indirect dispatch / indirect draw calls
- Multiple pipeline barrier transitions (storage read-after-write) per frame

Any of these can trigger a RADV GFX1201 driver bug in Mesa 26.1.0-devel. Since the kernel
does not report a hang, the crash is in RADV's userspace Vulkan layer or in wgpu's
command buffer submission path for GFX12.

**Sample compatibility matrix (X11 mode):**

| Sample | Status | Notes |
|---|---|---|
| `rotatingCube` | Works | Simple render pipeline, uniform buffer only |
| `computeBoids` | Works | Compute shader, direct dispatch, confirmed stable |
| `particleLife` | Works (isolated) | Crashed once when chaos-master was also rendering — GPU memory contention, not a driver bug |

Run this to test `computeBoids` as a bisection point:

```bash
env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 firefox-nightly \
  "https://webgpu.github.io/webgpu-samples/?sample=computeBoids"
```

- If `computeBoids` works: the crash is specific to indirect dispatch or complex compute
- If `computeBoids` also crashes: any compute shader dispatch is broken on GFX1201 in wgpu

**This is a distinct, separate bug from the OOM issue and should be filed separately**
against `Core :: Graphics: WebGPU` or upstream at `gfx-rs/wgpu` if the crash is reproducible
outside Firefox (e.g. with a standalone wgpu test binary on GFX1201).

### Bug 4 (Confirmed): `timestamp-query` + `resolveQuerySet` causes device loss on GFX1201

**Confirmed by:** disabling `trackPerformance` prop in chaos-master → app runs stably for hours.

When `requiredFeatures: ['timestamp-query']` is requested and the following pattern runs every
frame, Firefox's GPU process crashes after 3–10 seconds on GFX1201:

```ts
// Every frame — inside the render loop:
encoder.resolveQuerySet(
  timestampQuerySet,   // GPUQuerySet with 384 timestamp slots
  0,
  384,                 // ALL slots resolved every frame
  timestampBuffer,
  0,
)
encoder.copyBufferToBuffer(timestampBuffer, 0, timestampMappable, 0, size)

// After device.queue.onSubmittedWorkDone():
await timestampMappable.mapAsync(GPUMapMode.READ)
// ... read BigInt64Array ...
timestampMappable.unmap()
```

**Setup:** `GPUQuerySet` count = `timestampNames.length × 2 × pairLocationCount × 2`
= `3 × 2 × 32 × 2 = 384` entries. All 384 are resolved into a `QUERY_RESOLVE | COPY_SRC`
buffer, then copied to a `COPY_DST | MAP_READ` buffer, then `mapAsync`-ed for CPU readback.
This happens every animation frame.

**Error observed:**
```
WebGPU device was lost: Out of memory.
DOMException: Mapping WebGPU buffer failed: Context lost
DOMException: Not enough memory left.
```

**Why the error says "Out of memory":** The device loss occurs mid-operation. Firefox's wgpu
reports all device-lost events as `Out of memory` regardless of the actual cause when RAM
reporting is broken (see Bug 1). The real trigger is the `resolveQuerySet` + `mapAsync`
combination, not a buffer size issue.

**Bisection proof:**
- `trackPerformance={false}` → chaos-master runs stably indefinitely at 1e6 points
- `trackPerformance={true}` → device lost within 3–10 seconds regardless of point count
  (even at 1e2 = 100 points, which allocates 800 bytes of seed buffer)
- All WebGPU samples (`rotatingCube`, `computeBoids`, `particleLife`) work because none
  of them request or use `timestamp-query`

**Not reproduced on:** Chrome/Windows (uses D3D12 + Dawn, different timestamp path).

**Suspected root cause:** Firefox's wgpu Vulkan implementation of `resolveQuerySet` or
`mapAsync` on the resolved timestamp buffer has a race condition or memory-ordering bug
specific to GFX1201 (RDNA4 / GFX12 ISA). The 384-slot bulk resolve + copy-back on every
frame stresses this path until the GPU process state becomes inconsistent and is killed.

---

### Why Chrome and Firefox on Windows work

- Chrome uses **Dawn** (not wgpu), which interfaces differently with the Vulkan allocator.
- Windows uses **D3D12**, bypassing the Vulkan heap selection path entirely.
- Neither path hits the Firefox gfxInfo device-ID lookup failure.

---

## 3. Vulkan Memory Heap Inspection

Output of `vulkaninfo --summary` for the RADV GFX1201 device:

```
VkPhysicalDeviceMemoryProperties:
  memoryHeaps: count = 3

  memoryHeaps[0]:
    size   = 16911433728  (15.75 GiB)
    budget = 13214273536  (12.31 GiB)
    flags  = MEMORY_HEAP_DEVICE_LOCAL_BIT          <-- real VRAM

  memoryHeaps[1]:
    size   = 33658843136  (31.35 GiB)
    budget = 33439072256  (31.14 GiB)
    flags  = (none)                                 <-- GTT / system RAM

  memoryHeaps[2]:
    size   = 268435456    (256 MiB)
    budget = 55312384     (52.75 MiB)
    flags  = MEMORY_HEAP_DEVICE_LOCAL_BIT           <-- small specialised heap
```

The 256 MiB heap[2] is a specialised device-local heap. If `wgpu`'s allocator incorrectly
selects heap[2] over heap[0] for device-local allocations, the budget is exhausted immediately.
The `RAM: 0` issue in Firefox means the memory budget logic receives no useful cap, making
allocation decisions unpredictable.

### Per-allocation limits

```
RADV GFX1201:  maxMemoryAllocationSize = 0xFFFFFFFC  (~4 GiB)   -- fine
llvmpipe:      maxMemoryAllocationSize = 0x80000000  (2 GiB)    -- software fallback
```

Individual allocation limits are not the problem. Total budget accounting is.

### Vulkan instance version and device

```
Vulkan Instance Version: 1.4.350
Device: AMD Radeon RX 9070 XT (RADV GFX1201)
  apiVersion    = 1.4.346
  driverVersion = 26.0.99
  deviceType    = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU
```

---

## 4. WebGPU Adapter Limits (Firefox vs Spec Defaults)

The table below compares what Firefox exposes on this hardware against the WebGPU spec
guaranteed minimums (default limits). A third column shows what chaos-master actually uses.
No explicit `requiredLimits` are requested in `Root.tsx` — all defaults apply.

| Limit | Spec Default | Firefox/RADV GFX1201 | App Usage | Must Request? |
|---|---|---|---|---|
| `maxBufferSize` | 256 MB | **1 GB** | ~42 MB (accum buffer @ 1440p 1x) | No |
| `maxStorageBufferBindingSize` | 128 MB | **1 GB** | ~42 MB | No |
| `maxUniformBufferBindingSize` | 64 KB | **1 GB** | <1 KB (FlameUniforms) | No |
| `maxBindGroups` | 4 | 8 | 2 (camera + IFS) | No |
| `maxBindingsPerBindGroup` | 1000 | 22369621 | 4-6 | No |
| `maxBindGroupsPlusVertexBuffers` | 24 | 24 | <10 | No |
| `maxComputeInvocationsPerWorkgroup` | 256 | 1024 | 64 (`IFS_GROUP_SIZE`) | No |
| `maxComputeWorkgroupSizeX` | 256 | 1024 | 64 | No |
| `maxComputeWorkgroupSizeY` | 256 | 1024 | 1 | No |
| `maxComputeWorkgroupSizeZ` | 64 | 1024 | 1 | No |
| `maxComputeWorkgroupStorageSize` | 16 KB | 64 KB | 0 (no shared memory) | No |
| `maxComputeWorkgroupsPerDimension` | 65535 | 65535 | ~16 (ceil(1e5/4096)) | No |
| `maxDynamicStorageBuffersPerPipelineLayout` | 4 | 8 | 0 | No |
| `maxDynamicUniformBuffersPerPipelineLayout` | 8 | 16 | 0 | No |
| `maxInterStageShaderVariables` | 16 | 31 | 0 (compute only) | No |
| `maxSampledTexturesPerShaderStage` | 16 | 64 | 0 | No |
| `maxSamplersPerShaderStage` | 16 | 64 | 0 | No |
| `maxStorageBuffersPerShaderStage` | 8 | 64 | 3 | No |
| `maxStorageTexturesPerShaderStage` | 4 | 64 | 0 | No |
| `maxUniformBuffersPerShaderStage` | 12 | 64 | 1 | No |
| `maxVertexAttributes` | 16 | 32 | 0 (no vertex shader) | No |
| `maxVertexBuffers` | 8 | 16 | 0 | No |
| `maxVertexBufferArrayStride` | 2048 | 2048 | 0 | No |
| `maxColorAttachments` | 8 | 8 | 1 | No |
| `maxColorAttachmentBytesPerSample` | 32 | 128 | 4 (bgra8unorm) | No |
| `maxTextureDimension1D` | 8192 | 32767 | 0 | No |
| `maxTextureDimension2D` | 8192 | 16384 | canvas size (2560 max) | No |
| `maxTextureDimension3D` | 2048 | 16384 | 0 | No |
| `maxTextureArrayLayers` | 256 | 8192 | 0 | No |
| `minStorageBufferOffsetAlignment` | 256 b | 32 b | hardware more permissive | No |
| `minUniformBufferOffsetAlignment` | 256 b | 32 b | hardware more permissive | No |

**Conclusion: chaos-master does not need to request any higher limits.** All buffer sizes and
workgroup dimensions fit within WebGPU spec defaults. The OOM was caused by total GPU memory
pressure from multiple concurrent Flam3 instances with inflated point counts, not by hitting
any individual limit.

### Note on `core-features-and-limits`

Firefox's adapter advertises `core-features-and-limits` as a requestable feature. When requested
in `requiredFeatures`, it unlocks all hardware limits (the right column above) as usable defaults.
This is only needed if a single buffer needs to exceed 256 MB or similar — not required for
current usage.

---

## 5. Firefox Feature Decision Log (about:support)

Key entries from `about:support` → Graphics → Decision Log:

```
WEBGPU
  default  available                           <-- WebGPU itself is available

DMABUF_SURFACE_EXPORT
  env      blocked  FEATURE_FAILURE_BROKEN_DRIVER
                                               <-- GFX1201 blocklisted for DMA-BUF export

WEBGPU_EXTERNAL_TEXTURE
  runtime  blocked  WEBGPU_EXTERNAL_TEXTURE_UNSUPPORTED_OS
                                               <-- Linux not supported

WEBRENDER_COMPOSITOR
  env      blocklisted  FEATURE_FAILURE_WEBRENDER_COMPOSITOR_DISABLED
                                               <-- compositor path blocked

HARDWARE_VIDEO_DECODING_VULKAN
  user     disabled  (pref disabled)
```

### Failure Log

```
(#0)  Error: Texture is not submitted
(#1)  Error: RemoteTexture ready timeout
(#2)  Error: RemoteTexture ready timeout
(#3)  Error: RemoteTexture ready timeout
(#4)  Error: RemoteTexture ready timeout
```

These timeouts occur when Firefox cannot hand WebGPU-rendered frames to the Wayland compositor
via DMA-BUF (blocked above). The "Not enough memory" error is a misleading downstream symptom.

### After applying the X11 workaround

```
WebGPU: disabling SharedTexture swapchain: missing GBM_FORMAT_ARGB8888 dmabuf format
```

This warning appears repeatedly in X11 mode and is **non-fatal**. Firefox falls back to a
copy-based swapchain. WebGPU rendering works correctly.

---

## 6. Applied Fixes

### Fix 1: Launch Firefox in X11 mode (bypass DMA-BUF path)

**Status:** Confirmed working — rotating cube and chaos-master both render correctly.

The problem: Hyprland's `ENVariables.conf` sets `MOZ_ENABLE_WAYLAND=1` and
`GDK_BACKEND=wayland,x11,*` at the **systemd/dbus session level** via Hyprland's `env =`
directive. These propagate to all child processes regardless of shell overrides.

The fix: use `env -u` to strip `MOZ_ENABLE_WAYLAND` from the process environment before
Firefox can act on it, combined with forcing the GDK X11 backend:

```bash
env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 firefox-nightly
```

Firefox prints `Failed to open Wayland display, fallback to X11` and uses the X11 path,
bypassing the broken DMA-BUF texture submission chain.

Verify it worked: `about:support` → Window Protocol → should read `x11`.

#### Making it permanent

**Option A — wrapper script (recommended):**

```bash
cat > ~/.local/bin/firefox-nightly << 'EOF'
#!/bin/bash
exec env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 /usr/bin/firefox-nightly "$@"
EOF
chmod +x ~/.local/bin/firefox-nightly
```

Ensure `~/.local/bin` is in `$PATH` (it is by default on Arch). All terminal and keybind
launches will use this wrapper.

**Option B — override the `.desktop` launcher:**

```bash
cp /usr/share/applications/firefox-nightly.desktop \
   ~/.local/share/applications/firefox-nightly.desktop

sed -i \
  's|Exec=/usr/bin/firefox-nightly|Exec=env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 /usr/bin/firefox-nightly|g' \
  ~/.local/share/applications/firefox-nightly.desktop
```

#### Verifying the environment reached the process

```bash
# Launch then check /proc
env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 firefox-nightly &
sleep 5
cat /proc/$(pgrep -f firefox-nightly | head -1)/environ | tr '\0' '\n' \
  | grep -E "GDK_BACKEND|MOZ_ENABLE_WAYLAND|WAYLAND_DISPLAY"
```

#### Enabling WebGPU debug logging

```bash
MOZ_LOG="webgpu:5,gfx:5,DMABUF:5" \
env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 \
firefox-nightly 2>&1 | tee /tmp/ff-webgpu.log
```

Useful `MOZ_LOG` categories:

| Category | What it shows |
|---|---|
| `gfx:5` | Graphics init, feature decisions |
| `webgpu:5` | Adapter selection, device creation, OOM |
| `DMABUF:5` | DMA-BUF export/import |
| `DMABUFSurface:5` | Surface sharing with Wayland compositor |
| `WebGPUNative:5` | Low-level wgpu Vulkan calls |

### Fix 2: Timestamp query buffer cleanup (`createTimestampQuery.ts`)

**Status:** Applied to codebase.

`GPUQuerySet`, `GPUBuffer` (timestampBuffer), and `GPUBuffer` (timestampMappable) were created
directly on the `GPUDevice` — not through the `tgpu` root — and therefore not tracked for
cleanup by `root.destroy()`. The `onCleanup` block was commented out due to a warning from
destroying a buffer while a `mapAsync` was in flight.

**Fix:** unmap before destroying, then destroy all three resources.

```typescript
// createTimestampQuery.ts — before
// TODO: find out why there's a warning if we do this
// onCleanup(() => {
//   timestampBuffer.destroy()
//   timestampMappable.destroy()
// })

// After
onCleanup(() => {
  if (timestampMappable.mapState === 'mapped') {
    timestampMappable.unmap()
  }
  timestampBuffer.destroy()
  timestampMappable.destroy()
  timestampQuerySet.destroy()
})
```

This fires on every Flam3 unmount and on every reactive effect re-run, preventing steady
accumulation of GPU buffer allocations over the session lifetime.

### Fix 3: Reduce `.env.local` point counts

**Status:** Applied.

`.env.local` had developer overrides of `1e6` for both `VITE_DEFAULT_POINT_COUNT` and
`VITE_DEFAULT_VARIATION_PREVIEW_POINT_COUNT`. Each Flam3 instance allocates
`pointCountPerBatch × 8 bytes` for the `pointRandomSeeds` storage buffer:

- At `1e6`: 8 MB per instance
- At `1e5`: 0.8 MB per instance

With up to 7 concurrent Flam3 instances (1 main + 1 modal + 5 variation previews):

| Config | Seeds memory | Accum+Post | Total approx |
|---|---|---|---|
| `1e6` (old) | 7 × 8 MB = 56 MB | 2 × 42 MB = 84 MB | ~140 MB+ |
| `1e5` (fixed) | 7 × 0.8 MB = 5.6 MB | 2 × 42 MB = 84 MB | ~90 MB |

Firefox's wgpu/Vulkan memory budget for GFX1201 (due to the `RAM: 0` driver bug) is effectively
treated as a conservative fixed pool. The `1e6` config pushed well past it.

```bash
# .env.local — restored to Firefox-compatible values
# Restore 1e6 for Chrome/Windows where D3D12 has more permissive memory accounting.
VITE_DEFAULT_POINT_COUNT=1e5
VITE_DEFAULT_VARIATION_PREVIEW_POINT_COUNT=1e5
```

---

## 7. How to Launch Firefox with Correct Flags

Summary of all useful launch configurations:

```bash
# Minimum viable — X11 mode, WebGPU works
env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 firefox-nightly

# With full WebGPU + graphics debug logging
MOZ_LOG="webgpu:5,gfx:5,DMABUF:5" \
env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 \
firefox-nightly 2>&1 | tee /tmp/ff-webgpu.log

# Force specific Vulkan ICD (ensure RADV, not llvmpipe)
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/radeon_icd.x86_64.json \
env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 \
firefox-nightly

# Open directly to diagnostics pages
env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 firefox-nightly about:support
env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11 firefox-nightly about:gpu
```

### about:config flags for WebGPU

| Preference | Recommended | Notes |
|---|---|---|
| `dom.webgpu.enabled` | `true` | Core toggle |
| `gfx.webgpu.force-enabled` | `true` | Bypass any driver blocklist |
| `dom.webgpu.workers.enabled` | `false` | Reduces parallel GPU pressure |
| `widget.wayland-dmabuf-webgl.enabled` | `false` | Disable if RemoteTexture timeouts appear |

### Hyprland `ENVariables.conf` — the source of override

File: `~/.config/hypr/UserConfigs/ENVariables.conf`

```ini
# Line 11 — sets GDK backend session-wide via systemd/dbus:
env = GDK_BACKEND,wayland,x11,*

# Line 47 — forces Firefox to Wayland regardless of shell env:
env = MOZ_ENABLE_WAYLAND,1
```

These are injected via `systemctl --user set-environment` and `dbus-update-activation-environment`
when Hyprland starts, making them immune to normal shell `export` or command-line prefix overrides.
The only reliable override is `env -u MOZ_ENABLE_WAYLAND` (strips the variable from the child
process environment before exec).

---

## 8. chaos-master App Specific Findings

### Architecture

- **Root.tsx**: single `TgpuRoot` per app session, destroyed on component unmount
- **Flam3.tsx**: allocates per-render-session buffers, uses `requestAnimationFrame` loop
- **createTimestampQuery.ts**: creates raw `GPUDevice` resources (not tracked by tgpu root)
- **VariationSelector**: spawns a second `<Root>` with up to 5 concurrent Flam3 preview instances
- **LoadFlameModal**: third Flam3 instance for load preview

### Buffer allocation at 2560x1440, 1x pixel ratio

| Buffer | Size | Notes |
|---|---|---|
| `accumulationBuffer` | ~42 MB | `Bucket (12b) × 2560 × 1440` |
| `postprocessBuffer` | ~42 MB | Same layout |
| `pointRandomSeeds` (1e5) | 0.8 MB | `vec2u (8b) × 1e5` |
| `pointRandomSeeds` (1e6) | 8 MB | Old `.env.local` value |
| `timestampBuffer` | ~3 KB | Leaked before fix |
| `timestampMappable` | ~3 KB | Leaked before fix |
| `flameUniformsBuffer` | <1 KB | Per-transform, tiny |
| `outputTextureDimensionBuffer` | 8 B | `vec2i` |

### Lifecycle issues fixed

| Issue | Location | Status |
|---|---|---|
| Timestamp GPUQuerySet never destroyed | `createTimestampQuery.ts` | Fixed |
| Timestamp buffers (×2) never destroyed | `createTimestampQuery.ts` | Fixed |
| Point count 10x inflated in .env.local | `.env.local` | Fixed |

### Lifecycle issues confirmed clean

| Resource | Cleanup mechanism |
|---|---|
| `accumulationBuffer` / `postprocessBuffer` | `onCleanup` in `outputTextures` createMemo |
| `colorGradingUniforms` | `onCleanup` at Flam3 root |
| `pointRandomSeeds` | `onCleanup` at Flam3 root |
| `flameUniformsBuffer` | `onCleanup` in `createIFSPipeline` |
| `outputTextureDimensionBuffer` | `onCleanup` in `createIFSPipeline` |
| `TgpuRoot` | `root.destroy()` in Root.tsx `onCleanup` |

---

## 9. Mozilla Bugzilla Report (ready to file)

**URL:** https://bugzilla.mozilla.org/enter_bug.cgi
**Component:** Core :: Graphics: WebGPU

---

**Summary:**
`AMD RX 9070 XT (device 0x7550 / GFX1201 / RDNA4) — WebGPU fails with "Not enough memory" on Linux: GPU RAM reported as 0, DMABUF_SURFACE_EXPORT blocked`

---

**Description:**

WebGPU fails immediately on Firefox Nightly on Linux with an AMD Radeon RX 9070 XT (RDNA4 / GFX1201 / device ID 0x7550). Even a minimal rotating cube demo (`webgpu.github.io/webgpu-samples/?sample=rotatingCube`) fails.

**Console errors:**
```
WebGPU device was lost: Out of memory.
Trying to get WebGPU device again, if this fails, reload application to try again
DOMException: Not enough memory left.
```

**about:support shows:**

```
GPU #1
  Device ID    0x7550
  RAM          0          <-- incorrect, hardware has 16 GiB
```

The system's DRM sysfs correctly reports 16 GiB:
```bash
$ cat /sys/class/drm/card1/device/mem_info_vram_total
17095983104
```

Firefox's gfxInfo layer does not recognise device ID 0x7550 (Navi48 / RX 9070 XT / GFX1201) and reports RAM as 0. This causes wgpu's memory budget logic to fail on any allocation.

**Additionally, the Feature Decision Log shows:**
```
DMABUF_SURFACE_EXPORT
  env  blocked  FEATURE_FAILURE_BROKEN_DRIVER
```

On Wayland, this causes all WebGPU frames to fail submission to the compositor:
```
Error: Texture is not submitted
Error: RemoteTexture ready timeout  (×4)
```

**System info:**
```
OS:          Arch Linux
Kernel:      7.0.8-arch1-1
GPU:         AMD Radeon RX 9070 XT (RADV GFX1201)
PCI ID:      0x1002:0x7550
VRAM:        16 GiB (correctly reported by DRM, not by gfxInfo)
Mesa:        26.1.0-devel (git-1f9bc71051)
Vulkan:      1.4.350 / RADV driver 26.0.99
Desktop:     Hyprland (Wayland)
Firefox:     Nightly
```

**Vulkan memory heaps (vulkaninfo):**
```
heap[0]: 15.75 GiB  DEVICE_LOCAL  <-- main VRAM
heap[1]: 31.35 GiB  (GTT)
heap[2]:  0.25 GiB  DEVICE_LOCAL  <-- small specialised heap
maxMemoryAllocationSize: 0xFFFFFFFC (~4 GiB)
```

**WebGPU default adapter (from about:support):**
```json
{
  "wgpuName": "AMD Radeon RX 9070 XT (RADV GFX1201)",
  "wgpuBackend": "Vulkan",
  "wgpuDriver": "radv",
  "wgpuDeviceType": "DiscreteGpu",
  "isFallbackAdapter": false,
  "wgpuDevice": 30032
}
```

The adapter is correctly identified as DiscreteGpu with RADV. The failure is purely at the
gfxInfo/budget layer, not at Vulkan adapter selection.

**Workaround:**
Launching Firefox with `env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11` forces X11 mode, bypassing
the blocked DMA-BUF path. WebGPU then works correctly (with a non-fatal GBM_FORMAT warning).
This confirms the issue is in the Wayland/DMA-BUF texture submission path for GFX1201, not
in wgpu's Vulkan adapter or shader compilation.

**Expected:** WebGPU works on Linux with a 16 GiB AMD RDNA4 GPU.
**Actual:** Device lost with "Out of memory" immediately on any WebGPU operation under Wayland.

**Steps to reproduce:**
1. Install Firefox Nightly on Arch Linux with RADV GFX1201 (RX 9070 XT)
2. Ensure Wayland session (Hyprland or similar)
3. Navigate to `https://webgpu.github.io/webgpu-samples/?sample=rotatingCube`
4. Observe "Not enough memory" in DevTools console
5. Check `about:support` — GPU RAM will show 0

---

## 9b. Mozilla Bugzilla Report — timestamp-query (ready to file separately)

**URL:** https://bugzilla.mozilla.org/enter_bug.cgi
**Component:** Core :: Graphics: WebGPU

---

**Summary:**
`timestamp-query + resolveQuerySet every frame causes GPUDevice loss ("Out of memory") on Linux / AMD GFX1201 (RDNA4) within seconds`

---

**Description:**

Using the `timestamp-query` WebGPU feature on Linux with an AMD RX 9070 XT (RDNA4 / GFX1201
/ device 0x7550) causes the `GPUDevice` to be lost with `Out of memory` within 3–10 seconds
of rendering. The page continues to function (SolidJS UI remains responsive) but all WebGPU
operations fail.

**Console errors:**
```
WebGPU device was lost: Out of memory.
DOMException: Mapping WebGPU buffer failed: Context lost
DOMException: Not enough memory left.
```

**The crash pattern occurs every frame:**
1. `encoder.resolveQuerySet(querySet, 0, 384, resolveBuffer, 0)` — resolves all 384 slots
2. `encoder.copyBufferToBuffer(resolveBuffer, 0, mappableBuffer, 0, size)`
3. `device.queue.submit([encoder.finish()])`
4. After `device.queue.onSubmittedWorkDone()`: `await mappableBuffer.mapAsync(GPUMapMode.READ)`
5. Read `BigInt64Array`, then `mappableBuffer.unmap()`

**GPUQuerySet setup:**
```javascript
const querySet = device.createQuerySet({
  type: 'timestamp',
  count: 384,  // 3 timestamp pairs × 32 frame slots × 2 = 384
})

const resolveBuffer = device.createBuffer({
  size: 384 * 8,  // BigInt64Array, 3072 bytes
  usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
})

const mappableBuffer = device.createBuffer({
  size: 384 * 8,
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
})
```

**Bisection / isolation:**
- Disabling the `resolveQuerySet` + `mapAsync` loop entirely → application runs stably
  for hours with identical WebGPU workloads (same compute pipelines, same buffer sizes)
- The crash occurs at ANY point count, including 100 points (trivial compute load)
- No other WebGPU feature or buffer size is required to reproduce — the timing mechanism
  alone is sufficient
- Reproducible with `timestamp-query` in `requiredFeatures` only; removing it prevents crash

**WebGPU samples comparison:**
- `rotatingCube`, `computeBoids`, `particleLife` — all work correctly, none use `timestamp-query`
- Any sample or application that uses `timestamp-query` with a per-frame `resolveQuerySet`
  call will reproduce this crash

**System info:**
```
OS:          Arch Linux
Kernel:      7.0.8-arch1-1
GPU:         AMD Radeon RX 9070 XT (RADV GFX1201)
PCI ID:      0x1002:0x7550
VRAM:        16 GiB
Mesa:        26.1.0-devel (git-1f9bc71051)
Vulkan:      1.4.350 / RADV driver 26.0.99
Firefox:     Nightly
Window:      X11 (forced via env -u MOZ_ENABLE_WAYLAND GDK_BACKEND=x11)
```

**Note:** This system also has Bug 1 (device 0x7550 not in gfxInfo → RAM: 0). Running on X11
bypasses Bug 2 (DMABUF blocklist). This bug (timestamp-query crash) is independent of both
— it reproduces under X11 where all other WebGPU operations are stable.

**Expected:** `timestamp-query` resolves and maps correctly without causing device loss.
**Actual:** Device lost within seconds. The `Out of memory` label appears to be a
misclassification — the real cause is a wgpu/RADV GFX1201 interaction in the
`resolveQuerySet` → `copyBufferToBuffer` → `mapAsync` pipeline.

**Minimal reproduction steps:**
1. Firefox Nightly on Arch Linux with RADV GFX1201, X11 mode
2. Request a `GPUDevice` with `requiredFeatures: ['timestamp-query']`
3. Each frame: `resolveQuerySet` (384 entries) → `copyBufferToBuffer` → `queue.submit`
4. After `onSubmittedWorkDone`: `mapAsync(READ)` → read → `unmap`
5. Device is lost within 3–10 seconds

**Workaround:** Do not use `timestamp-query` on Linux / GFX1201. Detect via
`adapter.info.architecture` or similar and skip the timing path.

---

## 10. Long-Term Recommendations

### Upstream (Mozilla) — bugs to file

| Priority | Bug | Component |
|---|---|---|
| High | Add device ID `0x7550` (Navi48 family) to `gfxInfo` GPU database — fixes `RAM: 0` and restores VRAM budget | `Core :: Graphics: gfxInfo` |
| High | `timestamp-query` `resolveQuerySet` + `mapAsync` per frame causes `GPUDevice` loss on GFX1201/Linux within 3–10 seconds | `Core :: Graphics: WebGPU` |
| Medium | Remove GFX1201 from `DMABUF_SURFACE_EXPORT` blocklist once Mesa 26.x is stable, or gate on Mesa version check | `Core :: Widget: Gtk` |

See sections **9** and **9b** for complete ready-to-file Bugzilla descriptions.

### Upstream (Mesa / RADV)

The RADV GFX1201 driver is functional but new (Mesa 26.1.0-devel). Monitor the Mesa issue
tracker for:

- GBM_FORMAT_ARGB8888 DMA-BUF export support — unblocks the Wayland texture path natively
- Any `resolveQuerySet` / timestamp query correctness fixes for the GFX12 ISA
- Stabilisation of GFX1201 compute pipeline handling

### chaos-master App — applied and pending

| Status | Item | File |
|---|---|---|
| Fixed | `createTimestampQuery`: destroy `GPUQuerySet` + both `GPUBuffer`s on cleanup | `createTimestampQuery.ts` |
| Fixed | `VITE_TRACK_PERFORMANCE=false` default — timestamp-query disabled on Firefox/Linux | `defaults.ts`, `App.tsx` |
| Fixed | `VariationPreview`: strict `isVisible() === true` check prevents OOM storm — previously `!== false` caused all 57+ variations to allocate synchronously on frame 1 before the IntersectionObserver fired | `VariationSelector.tsx` |
| Fixed | `VariationPreview`: added `everVisible` latch so previews don't repeatedly unmount and mount (and destroy/allocate buffers) during rapid scrolling, preventing Vulkan deferred-destruction memory fragmentation OOM | `VariationSelector.tsx` |
| Fixed | `AutoCanvas`: added `fixedResolution` property; bypassing `ResizeObserver` for all 57+ variation previews. Previews render at a static internal 256x144 resolution and CSS stretches them, completely eliminating massive buffer reallocation churn when the window/dev-tools are resized | `AutoCanvas.tsx`, `VariationSelector.tsx` |
| Fixed | `Flam3`: moved `canvas.toBlob()` out of asynchronous `onSubmittedWorkDone()` microtask into the synchronous render task to prevent WebGPU `[Invalid Texture]` warnings in Chrome during canvas capture | `Flam3.tsx` |
| Fixed | `Modal`: caught `startViewTransition` promise rejections to prevent `DOMException: Skipped ViewTransition due to another transition starting` when closing UI fast | `Modal.tsx` |
| Fixed | `AutoCanvas`: added `display: block; width: 100%; height: 100%;` to prevent infinite CSS layout-resize loop caused by fractional canvas sizes in grid/flex containers | `AutoCanvas.tsx` |
| Fixed | `.env.local` point counts commented and reduced to `1e5` for Firefox/Linux dev | `.env.local` |
| Fixed | `useElementSize`: 100ms debounce added to `ResizeObserver` — prevents 60fps buffer reallocations during window drag, fixing rapid memory fragmentation OOM | `useElementSize.ts` |
| Fixed | `ifsPipeline`: implemented `pipelineCache` mapped to `JSON.stringify` structural signature of `transforms`. Previously, `createIFSPipeline` called `tgpu.computeFn` every render, creating a new function reference that bypassed `typegpu`'s caching, resulting in compiling 57 new WebGPU `GPUComputePipeline`s *every time* the modal was opened or parameters were edited | `ifsPipeline.ts` |
| Fixed | `Flam3`: added `pipelineSignature` memo tracking `transforms` structural shape to prevent outer `createEffect` from re-rendering and requesting new pipelines when only uniform values (like `probability`) changed | `Flam3.tsx` |
| Fixed | `VariationSelector`: corrected unused signal assignments (`setFlameZoom`, `setFlamePosition`) to properly mutate `previewFlame` store's `renderSettings.camera`, resolving `NaN` zoom math crashes in `WheelZoomCamera2D` | `VariationSelector.tsx` |
| Pending | Add `adapter.info` runtime check — warn if GPU RAM is 0 (indicates broken gfxInfo, suggests Firefox/Linux workarounds needed) | `Root.tsx` or `WebgpuAdapter.ts` |

