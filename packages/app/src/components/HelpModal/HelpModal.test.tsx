import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/contexts/ToastContext'
import { ModalContext } from '../Modal/ModalContext'
import { HelpModal } from './HelpModal'
import type { RequestModalFn } from '../Modal/ModalContext'

// The Haptics row is native-only. A getter, so each render reads the current
// value and one file can cover both builds. Hoisted with the mock: the layout
// store the Glass panels row imports reads IS_NATIVE while it loads.
const platform = vi.hoisted(() => ({ native: true }))
vi.mock('@/lib/platform', () => ({
  get IS_NATIVE() {
    return platform.native
  },
  apiUrl: (path: string) => path,
  publicOrigin: () => 'https://lumenapeiron.com',
}))

// The modal also reports the GPU and the storage it uses. Neither exists in
// happy-dom, and an unhandled adapter rejection fails the run, so both are
// stood in for: this file is about the Haptics row.
vi.mock('@/lib/WebgpuAdapter', () => ({
  getWebgpuComponents: () =>
    Promise.resolve({
      adapter: {
        info: { description: 'test', vendor: 'test', architecture: 'test' },
        limits: { maxBufferSize: 0 },
      },
    }),
}))
vi.mock('../DataManagement/DataManagement', () => ({
  DataManagement: () => null,
}))

const requestModal = (() => Promise.resolve(undefined)) as RequestModalFn

const [hapticsEnabled, setHapticsEnabled] = createSignal(true)

function mount() {
  render(() => (
    <ModalContext.Provider value={requestModal}>
      <ToastProvider>
        <HelpModal
          respond={() => undefined}
          quickPickerMode={() => 'list'}
          onQuickPickerModeChange={() => undefined}
          sidebarLayoutMode={() => 'wide'}
          onSidebarLayoutModeChange={() => undefined}
          isCompact={() => false}
          onSetCompact={() => undefined}
          theme={() => 'dark'}
          onThemeChange={() => undefined}
          hardwareTier={() => null}
          hapticsEnabled={hapticsEnabled}
          onHapticsEnabledChange={setHapticsEnabled}
        />
      </ToastProvider>
    </ModalContext.Provider>
  ))
}

describe('HelpModal haptics switch', () => {
  afterEach(() => {
    cleanup()
    setHapticsEnabled(true)
    platform.native = true
  })

  it('is on by default in the native app and can be turned off', () => {
    mount()
    // The type argument, not an assertion: eslint --fix strips the cast.
    const box = screen.getByLabelText<HTMLInputElement>('Haptics')
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(hapticsEnabled()).toBe(false)
  })

  it('is absent on the web', () => {
    platform.native = false
    mount()
    expect(screen.queryByLabelText('Haptics')).toBeNull()
  })
})
