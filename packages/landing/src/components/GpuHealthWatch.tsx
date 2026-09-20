import { onMount } from 'solid-js'
import { useRootContext } from '@/lib/RootContext'
import { watchDevice } from '../lib/webgpuHealth'

/**
 * Mounted inside a Root; registers GPU-failure listeners on the shared device so
 * the first out-of-memory / device-loss flips the whole page to static posters.
 * Renders nothing.
 */
export default function GpuHealthWatch() {
  const { device } = useRootContext()
  onMount(() => {
    // The degraded shell provides no device; there is nothing to watch.
    if (device) watchDevice(device)
  })
  return null
}
