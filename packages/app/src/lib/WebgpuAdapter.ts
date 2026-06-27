import { TRACK_PERFORMANCE } from '@/defaults'
import { gpuStatus, isGpuTerminallyDown, setGpuStatus } from '@/lib/gpuStatus'

let gpuDevice: GPUDevice | null = null
let gpuAdapter: GPUAdapter | null = null

const { navigator } = globalThis

// After a hard GPU-process crash (e.g. Firefox/wgpu TryFromSliceError SIGSEGV),
// requestAdapter/requestDevice can HANG instead of rejecting. Without a cap the
// Root resource never resolves and a RELOADED page just shows a blank/hung shell.
// Race against a timeout so init always settles into the degraded shell.
const INIT_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `WebGPU ${label} timed out after ${INIT_TIMEOUT_MS}ms — the GPU process may have crashed. Reload, or restart the browser if reloading doesn't help.`,
          { cause: 'WebGPU' },
        ),
      )
    }, INIT_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer)
  })
}

function assertIfWebgpuAdapterUnavailable(
  adapter: GPUAdapter | null,
): asserts adapter {
  if (!adapter) {
    console.error('No WebGPU adapters found.')
    throw new Error(
      `Failed to get GPUAdapter, make sure to use a browser with WebGPU support.`,
      { cause: 'WebGPU' },
    )
  }
}

function assertIfWebgpuDeviceUnavailable(
  device: GPUDevice | null,
): asserts device {
  if (!device) {
    console.error('WebGPU device unavailable.')
    throw new Error(
      `Failed to get GPUDevice, make sure to use a browser with WebGPU support.`,
      { cause: 'WebGPU' },
    )
  }
}

function assertIfWebgpuUnsupported() {
  // Check to ensure the user agent supports WebGPU.
  if (!('gpu' in navigator)) {
    console.error('User agent doesn’t support WebGPU.')
    throw new Error(
      `Failed to get GPUAdapter, make sure to use a browser with WebGPU support.`,
      { cause: 'WebGPU' },
    )
  }
}

/**
 * Build the set of optional features to request from the device.
 * `timestamp-query` is only requested when TRACK_PERFORMANCE is enabled
 * and the adapter actually advertises support (e.g. iOS Safari does not).
 */
function negotiateOptionalFeatures(adapter: GPUAdapter): GPUFeatureName[] {
  const features: GPUFeatureName[] = []
  if (TRACK_PERFORMANCE && adapter.features.has('timestamp-query')) {
    features.push('timestamp-query')
  }
  return features
}

export async function initializeWebgpuDevice(
  adapterPreferences?: GPURequestAdapterOptions,
  deviceFeatures?: GPUDeviceDescriptor,
) {
  if (!('gpu' in navigator)) {
    setGpuStatus('unsupported')
    assertIfWebgpuUnsupported()
  }

  setGpuStatus('initializing')

  try {
    gpuAdapter = await withTimeout(
      navigator.gpu.requestAdapter({ ...adapterPreferences }),
      'adapter request',
    )

    if (!gpuAdapter) {
      // navigator.gpu exists but no adapter — e.g. a blocklisted driver or a
      // crashed GPU process. Not "unsupported": the API is present, it just
      // can't give us a device right now.
      setGpuStatus('unavailable')
    }
    assertIfWebgpuAdapterUnavailable(gpuAdapter)

    // Always log adapter info for remote diagnostics
    const { info, features } = gpuAdapter
    console.info('[WebGPU] Adapter acquired:', {
      vendor: info.vendor,
      architecture: info.architecture,
      description: info.description,
      features: [...features].join(', '),
    })

    const optionalFeatures = negotiateOptionalFeatures(gpuAdapter)

    gpuDevice = await withTimeout(
      gpuAdapter.requestDevice({
        ...deviceFeatures,
        requiredFeatures: [
          ...(deviceFeatures?.requiredFeatures ?? []),
          ...optionalFeatures,
        ],
        requiredLimits: {
          ...(deviceFeatures?.requiredLimits ?? {}),
          maxBufferSize: gpuAdapter.limits.maxBufferSize,
          maxStorageBufferBindingSize:
            gpuAdapter.limits.maxStorageBufferBindingSize,
          maxComputeWorkgroupStorageSize:
            gpuAdapter.limits.maxComputeWorkgroupStorageSize,
        },
      }),
      'device request',
    )
  } catch (err) {
    // Any failure to acquire an adapter/device — including an init timeout from
    // a dead GPU process — makes WebGPU terminally unavailable for the session
    // so re-mounting Roots early-throw instead of re-hanging. ('unsupported',
    // set above when navigator.gpu is absent, is latched and unaffected.)
    setGpuStatus('unavailable')
    throw err
  }

  assertIfWebgpuDeviceUnavailable(gpuDevice)

  // Capture uncaptured errors so the browser stops logging them itself. Once the
  // device is (being) lost, in-flight work fails with a cascade of "<resource>
  // is invalid" / "destroyed" / "Not enough memory" errors — expected teardown
  // noise we swallow to keep the console clean (the render-loop gpuReady guards
  // already prevent most of it). A genuine error on a healthy device still
  // surfaces, now with explicit resource labels (see createView labels, etc.).
  gpuDevice.addEventListener('uncapturederror', (ev) => {
    if (isGpuTerminallyDown() || gpuDevice === null) {
      return
    }
    console.error('[WebGPU] uncaptured error:', ev.error.message)
  })

  // A fresh, live device — previews may render again.
  setGpuStatus('ready')

  // requestDevice will never return null, but if a valid device request can't be
  // fulfilled for some reason it may resolve to a device which has already been lost.
  // Additionally, devices can be lost at any time after creation for a variety of reasons
  // (ie: browser resource management, driver updates), so it's a good idea to always
  // handle lost devices gracefully.
  //
  // Recovery model: RELOAD-ONLY. We deliberately do NOT re-acquire a device in
  // place. Each Root resolves its device once (a one-shot createResource), so a
  // replacement device cannot reach already-mounted contexts — flipping back to
  // 'ready' would leave every mounted preview pointed at the dead device. And on
  // the Firefox/Linux/AMD target, re-acquiring on a just-OOM'd GPU simply
  // re-crashes it (the spiral we're removing). So one real loss is terminal:
  // mark 'unavailable', poster the previews, and let the user reload.
  gpuDevice.lost
    .then((info) => {
      console.warn(`WebGPU device was lost: ${info.message}.`)

      // Clear BOTH stale handles. Previously only the adapter was nulled, so a
      // consumer could still reach a dead `gpuDevice` and hammer it — part of
      // the "Buffer is invalid" cascade.
      gpuAdapter = null
      gpuDevice = null

      // reason==='destroyed' is OUR own teardown (Root.tsx onCleanup / HMR),
      // not a crash — leave the status alone.
      if (info.reason === 'destroyed') {
        return
      }

      setGpuStatus('unavailable')
      console.error('WebGPU device lost. Reload the page to recover.')
    })
    .catch(console.error)
}

// In-flight initialization, shared by concurrent callers. Without this, several
// Roots mounting on the same frame (e.g. a gallery of live previews) each see
// `gpuDevice === null` and call initializeWebgpuDevice, acquiring multiple
// adapters/devices — the extras are orphaned but still hold GPU memory, which on
// constrained impls (Firefox/Linux/AMD) pushes the page into OOM. Coalescing to a
// single init means one shared device for the whole page.
let initInFlight: Promise<void> | null = null

export async function getWebgpuComponents(
  adapterPreferences?: GPURequestAdapterOptions,
  deviceFeatures?: GPUDeviceDescriptor,
) {
  // Once the session is terminally down, STOP re-entering init. This is the
  // choke point that kills the "re-mount → re-init → OOM" loop: every Root,
  // gallery thumbnail, modal and the hardwareTier benchmark funnel through
  // here, so a single early-throw freezes the whole page's GPU churn.
  const status = gpuStatus()
  if (status === 'unavailable' || status === 'unsupported') {
    throw new Error('WebGPU is unavailable for this session.', {
      cause: 'WebGPU',
    })
  }

  if (gpuDevice === null || gpuAdapter === null) {
    initInFlight ??= initializeWebgpuDevice(
      adapterPreferences,
      deviceFeatures,
    ).finally(() => {
      initInFlight = null
    })
    await initInFlight
  }

  assertIfWebgpuAdapterUnavailable(gpuAdapter)
  assertIfWebgpuDeviceUnavailable(gpuDevice)
  return { adapter: gpuAdapter, device: gpuDevice }
}
