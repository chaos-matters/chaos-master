# Audit Report: WebGPU Firefox Linux (RDNA4) Crash Investigation

## Executive Summary
A series of "Out of Memory" crashes and blank WebGPU canvas issues were investigated on Firefox Nightly (Linux/Wayland) using an AMD RDNA4 (GFX12) GPU. The root cause was identified as a combination of three factors:
1. **Pipeline Compilation Flood**: 34+ distinct WebGPU compute pipelines being compiled concurrently when opening a gallery modal.
2. **Deferred Buffer Destruction**: A rapid sequence of huge window resize events (e.g., Hyprland fullscreen toggle) causing 60-70MB WebGPU storage buffers to be "destroyed" but kept alive in Vulkan memory until the command queue completed.
3. **Firefox/wgpu IPC Race Condition**: The extreme memory pressure and rapid creation/destruction of buffers triggered a fatal Rust panic in Firefox's WebGPU IPC translation layer.

## The Firefox Crash (`TryFromSliceError`)
The key piece of evidence was found in the Firefox crash log (`docs/audit/logs.md`):
`MozCrashReason: called Result::unwrap() on an Err value: TryFromSliceError(())`

### Why this happens in wgpu
This is a classic Rust panic in Firefox's `wgpu` integration.
- **IPC Mechanism**: Firefox uses a multi-process architecture where the Web Content process sends serialized WebGPU commands to the GPU process over IPC.
- **The Panic**: `TryFromSliceError` occurs when the receiver (GPU process) attempts to convert a raw byte slice (received from IPC) into a strongly typed array or struct, but the byte slice is truncated or size-mismatched.
- **The Trigger**: Flooding the IPC channel with rapid pipeline creations, large uniform buffer writes, and immediate buffer destruction (via HMR or 34 variation canvases rendering simultaneously) exposed a race condition in the IPC serialization layer. The `unwrap()` call on the failed conversion immediately crashed the entire Firefox GPU process with a `SIGSEGV`.
- **Result**: Because the GPU process crashed, the `navigator.gpu.requestAdapter()` call started returning `null` on subsequent page loads (yielding a blank screen), exactly as if WebGPU was completely unsupported. This requires a full browser restart to fix.

## Application-Level Fixes Implemented
While the root cause is a Firefox/wgpu bug, we mitigated it at the application layer:
1. **Pipeline Structural Caching**: Implemented a cache in `ifsPipeline.ts` keyed by the structural signature of the transformations. This prevents redundant pipeline re-compilations during UI interactions.
2. **WGSL Closure Capture Fix**: Refactored `camera2DWorldToClip` to a global scope. TypeGPU's parser was failing to capture closure variables correctly when a pipeline was served from the cache, causing shader compilation errors.
3. **Compute Gate Throttling**: The gallery modal attempted to compute 5 variations simultaneously (`capacity={5}`). This was reduced to `capacity={2}` (and exposed via `VITE_COMPUTE_GATE_CAPACITY` in `.env.local`). This severely throttles the concurrency of buffer allocation and shader compilation, giving the Vulkan driver enough time to garbage collect destroyed buffers before OOMing or triggering the IPC race condition.

## How to Debug this in Firefox Locally (Next Steps)
If you want to investigate the upstream Firefox/wgpu bug yourself, here is where you should look:

### 1. Firefox Source (`dom/webgpu` and `gfx/wgpu`)
- The error `TryFromSliceError` likely originates in the `wgpu-core` bindings or the IPC serialization code in `dom/webgpu/ipc`.
- Search the Mozilla Central repository for `unwrap()` calls on `TryInto` or `TryFromSlice` operations relating to WebGPU buffers, bind groups, or pipeline layouts. A common culprit is `Queue::write_buffer` or deserializing bind group layouts.

### 2. wgpu-core / wgpu-hal
- Mozilla periodically syncs `wgpu` from the `gfx-rs/wgpu` upstream.
- Look into `wgpu-core/src/device/queue.rs` or `wgpu-core/src/hub.rs`.
- A common source of these panics is when a buffer mapping is requested or written to, but the buffer size tracked by the content process differs from what the GPU process received (e.g., if the buffer was destroyed asynchronously but a write command was already in flight).

### 3. Vulkan Memory Allocator (VMA) / RADV Spec
- RDNA4 / GFX12 support in Mesa's RADV driver is relatively new.
- WebGPU on Vulkan uses deferred destruction. When `buffer.destroy()` is called, `wgpu-hal` adds the resource to a pending release queue. The actual Vulkan `vkFreeMemory` call doesn't happen until the fence for the current command buffer is signaled.
- If memory pressure is extremely high, wgpu might fail to allocate a new staging buffer (silently failing or returning an empty slice), which is then `unwrap()`'ed blindly by Firefox's WebGPU binding.
- **Heap Selection Bug (gpu-allocator)**: The most productive path for code-level fixes would be to look at Firefox's pinned `wgpu` version in `third_party/rust/wgpu-hal`, specifically the Vulkan memory allocator heap selection code. The allocator (`gpu-allocator` crate) should prefer `heap 0` over `heap 2` for `DEVICE_LOCAL` allocations. If it picks `heap 2` first (because it appears first or has a scoring bug with RDNA4's memory architecture), it explains the instant OOM.
- **Patch Target**: Look in `wgpu-hal/src/vulkan/device.rs` for the `select_memory_type` or `find_memory_type_index` function. Adding logging or an override here will confirm which heap index is being selected during these high-churn allocations.

### 4. Running a Local Firefox Build
- Build Firefox locally with `./mach build`.
- Run with `RUST_BACKTRACE=1` or `RUST_BACKTRACE=full` to get the exact file and line number of the `TryFromSliceError` panic in the terminal output.
- You can also run with `MOZ_LOG="WebGPU:5"` to get detailed WebGPU IPC logging. This will show you exactly which WebGPU command was in flight when the slice error occurred.
