/**
 * The provider stack for a page that runs without the editor, such as the
 * Benchmark Lab or the deep-zoom explorer: theme, toasts, the WebGPU root,
 * modals and a crash boundary around the page itself.
 */
import { ErrorBoundary, Suspense } from 'solid-js'
import { AppCrashed } from '@/components/ErrorHandling/ErrorHandling'
import { Modal } from '@/components/Modal/Modal'
import { NativeSaveToasts } from '@/components/NativeSaveToasts/NativeSaveToasts'
import { ToastHost } from '@/components/Toast/Toast'
import { CompactModeProvider } from '@/contexts/CompactModeContext'
import { ThemeContextProvider } from '@/contexts/ThemeContext'
import { TimelineProvider } from '@/contexts/TimelineContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { Root } from '@/lib/Root'
import type { ParentProps } from 'solid-js'

export function StandalonePage(props: ParentProps) {
  return (
    <CompactModeProvider>
      <ThemeContextProvider>
        <ToastProvider>
          <NativeSaveToasts />
          <Root adapterOptions={{ powerPreference: 'high-performance' }}>
            <TimelineProvider>
              <Modal>
                <ErrorBoundary
                  fallback={(error) => {
                    console.error(error)
                    return <AppCrashed />
                  }}
                >
                  <Suspense>{props.children}</Suspense>
                </ErrorBoundary>
              </Modal>
            </TimelineProvider>
          </Root>
          <ToastHost />
        </ToastProvider>
      </ThemeContextProvider>
    </CompactModeProvider>
  )
}
