import { ErrorBoundary, Suspense } from 'solid-js'
import { AppCrashed } from '@/components/ErrorHandling/ErrorHandling'
import { Modal } from '@/components/Modal/Modal'
import { ToastHost } from '@/components/Toast/Toast'
import { CompactModeProvider } from '@/contexts/CompactModeContext'
import { ThemeContextProvider } from '@/contexts/ThemeContext'
import { TimelineProvider } from '@/contexts/TimelineContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { Root } from '@/lib/Root'
import { BenchmarksPage } from './BenchmarksPage'

export function BenchmarksApp() {
  return (
    <CompactModeProvider>
      <ThemeContextProvider>
        <ToastProvider>
          <Root adapterOptions={{ powerPreference: 'high-performance' }}>
            <TimelineProvider>
              <Modal>
                <ErrorBoundary
                  fallback={(error) => {
                    console.error(error)
                    return <AppCrashed />
                  }}
                >
                  <Suspense>
                    <BenchmarksPage />
                  </Suspense>
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
