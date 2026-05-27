import { batch, createEffect, createResource, createSignal, ErrorBoundary, onCleanup, Show, Suspense, } from 'solid-js'
import { AppCrashed, WebgpuNotSupported, } from './components/ErrorHandling/ErrorHandling'
import { Modal } from './components/Modal/Modal'
import { WelcomeScreen } from './components/WelcomeScreen/WelcomeScreen'
import { CompactModeProvider } from './contexts/CompactModeContext'
import { KeyframeTargetProvider } from './contexts/KeyframeTargetContext'
import { createSpotlightTourState, SpotlightTourContext, } from './contexts/SpotlightTourContext'
import { ThemeContextProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { IS_DEV } from './defaults'
import { Root } from './lib/Root'
import { MainWorkspace } from './MainWorkspace'
import { appTour } from './tours/appTour'
import { sidebarTour } from './tours/sidebarTour'
import { timelineTour } from './tours/timelineTour'
import { decodeSharePayload } from './utils/jsonQueryParam'
import { persistentSignal } from './utils/persistentSignal'
import { recordKeys } from './utils/record'
import { dismissWelcome, hasWelcomeBeenDismissed, } from './utils/welcomeDismissed'
import type { TourGuide } from './components/SpotlightTour/tourTypes'
import type { FlameDescriptor } from './flame/schema/flameSchema'
import type { TimelineTrack } from './utils/timeline'

function getTour(id: string): TourGuide | undefined {
  switch (id) {
    case 'app':
      return appTour
    case 'sidebar':
      return sidebarTour
    case 'timeline':
      return timelineTour
    default:
      return undefined
  }
}

export type ExportImageType = (canvas: HTMLCanvasElement) => void

export function Wrappers() {
  const [showWelcome, setShowWelcome] = createSignal(!hasWelcomeBeenDismissed())
  const [dontShowAgain, setDontShowAgain] = persistentSignal(
    'dontShowWelcome',
    false,
  )
  const [selectedFlame, setSelectedFlame] = createSignal<
    FlameDescriptor | undefined
  >()
  const [selectedWelcomeTracks, setSelectedWelcomeTracks] = createSignal<
    TimelineTrack[] | undefined
  >()

  const [flameFromQuery] = createResource(async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const flameDef = urlParams.get('flame')
    if (flameDef !== null) {
      try {
        const result = await decodeSharePayload(flameDef)
        if (IS_DEV) {
          console.info('[share:resource] decode succeeded:', {
            hasFlame: !!result?.flame,
            transformCount: result?.flame
              ? recordKeys(result.flame.transforms ?? {}).length
              : 0,
            hasAnimation: !!result?.animation,
            animTrackCount: result?.animation?.tracks?.length ?? 0,
          })
        }
        return result
      } catch (err) {
        console.error('Failed to decode share payload:', err)
      }
    }
    return undefined
  })

  const spotlightState = createSpotlightTourState(getTour)

  // Auto-dismiss welcome screen when a query flame is present in the URL
  createEffect(() => {
    const fq = flameFromQuery()
    if (fq?.flame) {
      setShowWelcome(false)
    }
  })

  // Support #tour=app|sidebar|timeline hash URLs
  createEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
      const match = /#tour=([a-zA-Z0-9_-]+)/.exec(hash)
      if (match) {
        const tourId = match[1]!
        setShowWelcome(false)
        spotlightState.startTour(tourId)
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    onCleanup(() => {
      window.removeEventListener('hashchange', handleHashChange)
    })

    // Check initial hash on mount
    handleHashChange()
  })

  // Log what gets passed to App
  createEffect(() => {
    const fq = flameFromQuery()
    if (fq !== undefined) {
      if (IS_DEV) {
        console.info('[share:wrappers] passing to App:', {
          hasFlame: !!fq.flame,
          transformCount: fq.flame
            ? recordKeys(fq.flame.transforms ?? {}).length
            : 0,
          hasAnimation: !!fq.animation,
          animTrackCount: fq.animation?.tracks?.length ?? 0,
        })
      }
    }
  })

  function handleStartTour(tourId: string) {
    setShowWelcome(false)
    spotlightState.startTour(tourId)
  }

  const errorHandler = (err: unknown, _: () => void) => {
    if (err instanceof Error) {
      if (err.cause === 'WebGPU') {
        return <WebgpuNotSupported />
      }
    }
    console.error(err)
    return <AppCrashed />
  }

  return (
    <CompactModeProvider>
      <SpotlightTourContext.Provider value={spotlightState}>
        <ThemeContextProvider>
          <KeyframeTargetProvider>
            <Modal>
              <ErrorBoundary fallback={errorHandler}>
                <Root
                  adapterOptions={{
                    powerPreference: 'high-performance',
                  }}
                >
                  <Suspense>
                    <ToastProvider>
                      <MainWorkspace
                        flameFromQuery={flameFromQuery()}
                        flameFromWelcome={selectedFlame}
                        welcomeTracks={selectedWelcomeTracks}
                        resetFlameFromWelcome={() => {
                          setSelectedFlame(undefined)
                          setSelectedWelcomeTracks(undefined)
                        }}
                      />
                    </ToastProvider>
                    {/* WelcomeScreen overlay on top */}
                    <Show when={showWelcome()}>
                      <WelcomeScreen
                        showDontShowAgain={dontShowAgain()}
                        onDontShowAgainChange={(checked) => {
                          setDontShowAgain(checked)
                          if (checked) {
                            dismissWelcome()
                          }
                        }}
                        onEnter={() => setShowWelcome(false)}
                        onSelectFlame={(flame, tracks) => {
                          batch(() => {
                            setSelectedFlame(() => flame)
                            setSelectedWelcomeTracks(() => tracks)
                          })
                        }}
                        onStartTour={handleStartTour}
                        onShowAbout={() => {
                          setShowWelcome(false)
                          // Trigger the floating version pill to open About
                          requestAnimationFrame(() => {
                            const pill =
                              document.querySelector<HTMLButtonElement>(
                                '[class*="about-pill"]',
                              )
                            pill?.click()
                          })
                        }}
                      />
                    </Show>
                  </Suspense>
                </Root>
              </ErrorBoundary>
            </Modal>
          </KeyframeTargetProvider>
        </ThemeContextProvider>
      </SpotlightTourContext.Provider>
    </CompactModeProvider>
  )
}
