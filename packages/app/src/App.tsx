import { batch, createEffect, createResource, createSignal, ErrorBoundary, onCleanup, Show, Suspense, } from 'solid-js'
import { AppCrashed, WebgpuNotSupported, } from './components/ErrorHandling/ErrorHandling'
import { Modal } from './components/Modal/Modal'
import { WelcomeScreen } from './components/WelcomeScreen/WelcomeScreen'
import { CompactModeProvider } from './contexts/CompactModeContext'
import { KeyframeTargetProvider } from './contexts/KeyframeTargetContext'
import { createSpotlightTourState, SpotlightTourContext, } from './contexts/SpotlightTourContext'
import { ThemeContextProvider } from './contexts/ThemeContext'
import { ToastProvider, useToast } from './contexts/ToastContext'
import { IS_DEV } from './defaults'
import { Root } from './lib/Root'
import { MainWorkspace } from './MainWorkspace'
import { appTour } from './tours/appTour'
import { example1CreationTour } from './tours/example1CreationTour'
import { example2CreationTour } from './tours/example2CreationTour'
import { flameCreationTour } from './tours/flameCreationTour'
import { sidebarTour } from './tours/sidebarTour'
import { timelineTour } from './tours/timelineTour'
import { isBenchmarkAuto, isBenchmarkRequested } from './utils/benchmarkRequest'
import { decodeSharePayload } from './utils/jsonQueryParam'
import { persistentSignal } from './utils/persistentSignal'
import { recordKeys } from './utils/record'
import { dismissWelcome, hasWelcomeBeenDismissed, } from './utils/welcomeDismissed'
import type { TourGuide } from './components/SpotlightTour/tourTypes'
import type { FlameDescriptor } from './flame/schema/flameSchema'
import type { HardwareTier } from './utils/hardwareTier'
import type { TimelineTrack } from './utils/timeline'

function getTour(id: string): TourGuide | undefined {
  switch (id) {
    case 'app':
      return appTour
    case 'flame-creation':
      return flameCreationTour
    case 'sidebar':
      return sidebarTour
    case 'timeline':
      return timelineTour
    case 'example1-creation':
      return example1CreationTour
    case 'example2-creation':
      return example2CreationTour
    default:
      return undefined
  }
}

export type ExportImageInfo = {
  /** True when the canvas holds a final color-graded image at the requested
   *  quality limit, i.e. it is safe to capture the canvas for an export. */
  finalImageReady: boolean
}

export type ExportImageType = (
  canvas: HTMLCanvasElement,
  info?: ExportImageInfo,
) => void

function QueryErrorToast(props: { error: string | null }) {
  const { showToast } = useToast()
  createEffect(() => {
    if (props.error) {
      showToast(props.error)
    }
  })
  return null
}

export function Wrappers() {
  // `?benchmark` (or `?benchmark=1`) is the "request benchmark" entry point:
  // skip the welcome screen and open the benchmark dialog straight away.
  // `?benchmark=auto` additionally starts the run on load.
  const benchmarkRequested = isBenchmarkRequested(window.location.search)
  const benchmarkAuto = isBenchmarkAuto(window.location.search)
  const [showWelcome, setShowWelcome] = createSignal(
    !hasWelcomeBeenDismissed() && !benchmarkRequested,
  )
  const [dontShowAgain, setDontShowAgain] = persistentSignal(
    'dontShowWelcome',
    false,
  )
  const [hardwareTier, setHardwareTier] = persistentSignal<HardwareTier | null>(
    'hardwareTier',
    null,
  )
  const [selectedFlame, setSelectedFlame] = createSignal<
    FlameDescriptor | undefined
  >()
  const [selectedWelcomeTracks, setSelectedWelcomeTracks] = createSignal<
    TimelineTrack[] | undefined
  >()
  const [queryError, setQueryError] = createSignal<string | null>(null)

  const [flameFromQuery] = createResource(async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const shortId = urlParams.get('s')
    let flameDef = urlParams.get('flame')

    if (shortId) {
      try {
        const res = await fetch(`/api/shorten/${shortId}`)
        if (res.ok) {
          const json = await res.json()
          if (json.payload) {
            flameDef = json.payload
          }
        } else {
          setQueryError('The shared link could not be found or has expired.')
          console.error('Failed to fetch short URL payload', await res.text())
        }
      } catch (err) {
        setQueryError('Failed to fetch the shared link. Network error.')
        console.error('Error fetching short URL:', err)
      }
    }

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
        setQueryError('Failed to decode the shared fractal.')
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
            <ToastProvider>
              <Modal>
                <ErrorBoundary fallback={errorHandler}>
                  <Root
                    adapterOptions={{
                      powerPreference: 'high-performance',
                    }}
                  >
                    <Suspense>
                      <QueryErrorToast error={queryError()} />
                      <MainWorkspace
                        flameFromQuery={flameFromQuery()}
                        flameFromWelcome={selectedFlame}
                        welcomeTracks={selectedWelcomeTracks}
                        autoOpenBenchmark={benchmarkRequested}
                        autoStartBenchmark={benchmarkAuto}
                        hardwareTier={hardwareTier()}
                        onHardwareTierChange={setHardwareTier}
                        resetFlameFromWelcome={() => {
                          setSelectedFlame(undefined)
                          setSelectedWelcomeTracks(undefined)
                        }}
                      />
                    </Suspense>
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
                        hardwareTier={hardwareTier()}
                        onHardwareTierChange={setHardwareTier}
                      />
                    </Show>
                  </Root>
                </ErrorBoundary>
              </Modal>
            </ToastProvider>
          </KeyframeTargetProvider>
        </ThemeContextProvider>
      </SpotlightTourContext.Provider>
    </CompactModeProvider>
  )
}
