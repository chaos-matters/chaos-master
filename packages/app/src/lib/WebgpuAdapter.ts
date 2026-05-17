let gpuDevice: GPUDevice | null = null
let gpuAdapter: GPUAdapter | null = null

const { navigator } = globalThis

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

function assertRequiredWebgpuFeaturesNotAvailable(
  adapter: GPUAdapter,
  requiredFeatures: Iterable<GPUFeatureName>,
) {
  for (const feature of requiredFeatures) {
    if (!adapter.features.has(feature)) {
      throw new Error(
        `This sample requires the '${feature}' feature, which is not supported by this system.`,
        { cause: 'WebGPU' },
      )
    }
  }
}

export async function initializeWebgpuDevice(
  adapterPreferences?: GPURequestAdapterOptions,
  deviceFeatures?: GPUDeviceDescriptor,
) {
  assertIfWebgpuUnsupported()

  gpuAdapter = await navigator.gpu.requestAdapter({
    ...adapterPreferences,
  })

  assertIfWebgpuAdapterUnavailable(gpuAdapter)
  if (gpuAdapter.info.vendor !== '') {
    console.info(`Using ${gpuAdapter.info.vendor} WebGPU adapter.`)
  }

  assertRequiredWebgpuFeaturesNotAvailable(
    gpuAdapter,
    deviceFeatures?.requiredFeatures ?? [],
  )
  gpuDevice = await gpuAdapter.requestDevice(deviceFeatures)

  // requestDevice will never return null, but if a valid device request can't be
  // fulfilled for some reason it may resolve to a device which has already been lost.
  // Additionally, devices can be lost at any time after creation for a variety of reasons
  // (ie: browser resource management, driver updates), so it's a good idea to always
  // handle lost devices gracefully.
  //
  // Retry limit: on Firefox/Linux with GFX1201 an OOM device loss causes SolidJS reactive
  // effects to immediately hammer the dead device with new resource creation calls, each of
  // which also fails, causing another device loss, triggering another retry — indefinitely.
  // Root.tsx holds a stale device reference that cannot be updated without remounting the
  // resource, so retrying more than once has no practical benefit and only makes the spiral
  // worse. One retry covers genuinely transient losses (driver update, GPU reset). After
  // that, the user must reload.
  const MAX_DEVICE_LOSS_RETRIES = 1
  let deviceLossRetryCount = 0

  gpuDevice.lost
    .then(async (info) => {
      console.warn(`WebGPU device was lost: ${info.message}.`)

      gpuAdapter = null

      if (
        info.reason !== 'destroyed' &&
        deviceLossRetryCount < MAX_DEVICE_LOSS_RETRIES
      ) {
        deviceLossRetryCount += 1
        console.info(
          'Trying to get WebGPU device again, if this fails, reload application to try again',
        )
        // Brief backoff to let the GPU process recover before requesting a new device.
        await new Promise((resolve) => setTimeout(resolve, 500))
        await initializeWebgpuDevice(adapterPreferences, deviceFeatures)
      } else {
        deviceLossRetryCount = 0
        if (info.reason !== 'destroyed') {
          console.error(
            'WebGPU device lost and retry limit reached. Reload the page to recover.',
          )
        }
      }
    })
    .catch(console.error)
}

export async function getWebgpuComponents(
  adapterPreferences?: GPURequestAdapterOptions,
  deviceFeatures?: GPUDeviceDescriptor,
) {
  if (gpuDevice === null || gpuAdapter === null) {
    await initializeWebgpuDevice(adapterPreferences, deviceFeatures)
  }

  assertIfWebgpuAdapterUnavailable(gpuAdapter)
  assertIfWebgpuDeviceUnavailable(gpuDevice)
  return { adapter: gpuAdapter, device: gpuDevice }
}
