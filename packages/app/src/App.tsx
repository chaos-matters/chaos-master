import { batch, createEffect, createResource, createSignal, ErrorBoundary, onCleanup, onMount, Show, Suspense, } from 'solid-js'
import { AppCrashed, WebgpuNotSupported, } from './components/ErrorHandling/ErrorHandling'
import { HomeTab } from './components/Home/HomeTab'
import { Modal } from './components/Modal/Modal'
import { ToastHost } from './components/Toast/Toast'
import { WelcomeScreen } from './components/WelcomeScreen/WelcomeScreen'
import { CompactModeProvider } from './contexts/CompactModeContext'
import { KeyframeTargetProvider } from './contexts/KeyframeTargetContext'
import { createSpotlightTourState, SpotlightTourContext, } from './contexts/SpotlightTourContext'
import { ThemeContextProvider } from './contexts/ThemeContext'
import { ToastProvider, useToast } from './contexts/ToastContext'
import { IS_DEV } from './defaults'
import { initAncestry } from './flame/ancestry'
import { importSharedVariations, loadCustomVariations, remapFlameCustomVariations, } from './flame/variations/custom'
import { activeTab, setActiveTab } from './lib/activeTab'
import { Root } from './lib/Root'
import { MainWorkspace } from './MainWorkspace'
import { getTour } from './tours/registry'
import { isBenchmarkAuto, isBenchmarkRequested } from './utils/benchmarkRequest'
import { decodeSharePayload, decodeVariationShare, } from './utils/jsonQueryParam'
import { persistentSignal } from './utils/persistentSignal'
import { recordKeys } from './utils/record'
import { dismissWelcome, hasWelcomeBeenDismissed, } from './utils/welcomeDismissed'
import type { FlameDescriptor } from './flame/schema/flameSchema'
import type { HardwareTier } from './utils/hardwareTier'
import type { TimelineTrack } from './utils/timeline'

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
  // Load persisted ancestry data from IndexedDB on startup.
  onMount(() => {
    void initAncestry()
  })

  // `?benchmark` (or `?benchmark=1`) is the "request benchmark" entry point:
  // skip the welcome screen and open the benchmark dialog straight away.
  // `?benchmark=auto` additionally starts the run on load.
  const benchmarkRequested = isBenchmarkRequested(window.location.search)
  const benchmarkAuto = isBenchmarkAuto(window.location.search)
  // Local/dev escape hatch (e.g. driving the app with Playwright): skip the
  // welcome screen — and with it the on-startup hardware-tier detection, which
  // lives inside WelcomeScreen. Off in production builds (env unset → false).
  const skipWelcome = import.meta.env.VITE_SKIP_WELCOME === 'true'
  const [showWelcome, setShowWelcome] = createSignal(
    !hasWelcomeBeenDismissed() && !benchmarkRequested && !skipWelcome,
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
  /**
   * Set only by Home's "Explore" cards: the capability the chosen flame was
   * curated to demonstrate. Rides the same one-shot hand-off as the flame and
   * its tracks — MainWorkspace reads all three in one effect and calls
   * `resetFlameFromWelcome`, which clears the lot.
   */
  const [selectedCapability, setSelectedCapability] = createSignal<string>()
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
            customVariationCount: result?.customVariations?.length ?? 0,
          })
        }
        // Re-validate and register any custom variations embedded in the link.
        // Untrusted input: importSharedVariations recompiles each through the
        // allowlist compiler and registers them transiently (not saved) — the
        // recipient is asked to save them via the consent prompt downstream.
        if (result.customVariations && result.customVariations.length > 0) {
          // Load the saved library first so collision detection sees it.
          loadCustomVariations()
          const imported = importSharedVariations(result.customVariations)
          const flame = remapFlameCustomVariations(result.flame, imported.remap)
          if (imported.rejected.length > 0) {
            const n = imported.rejected.length
            setQueryError(
              `${n} custom variation${n === 1 ? '' : 's'} in this link could not be loaded and ${n === 1 ? 'was' : 'were'} skipped.`,
            )
            console.warn(
              'Rejected shared custom variations:',
              imported.rejected,
            )
          }
          return {
            ...result,
            flame,
            importedCustomVariations: imported.imported,
            alreadyOwnedCustomVariations: imported.alreadyOwned,
          }
        }
        return result
      } catch (err) {
        setQueryError('Failed to decode the shared fractal.')
        console.error('Failed to decode share payload:', err)
      }
    }
    return undefined
  })

  // A single custom variation shared via `?cv=`. Decoded, re-validated through
  // the allowlist compiler, and transiently registered so MainWorkspace can
  // preview it and offer to save. Untrusted: importSharedVariations never trusts
  // the payload's claims.
  const [sharedVariationFromQuery] = createResource(async () => {
    const cv = new URLSearchParams(window.location.search).get('cv')
    if (cv === null) return undefined
    try {
      const def = await decodeVariationShare(cv)
      loadCustomVariations()
      const result = importSharedVariations([def])
      if (result.alreadyOwned.length > 0) {
        return { def: result.alreadyOwned[0]!, alreadyOwned: true }
      }
      if (result.imported.length > 0) {
        return { def: result.imported[0]!, alreadyOwned: false }
      }
      setQueryError('The shared variation could not be loaded.')
      console.warn('Rejected shared variation:', result.rejected)
      return undefined
    } catch (err) {
      setQueryError('Failed to decode the shared variation.')
      console.error('Failed to decode shared variation:', err)
      return undefined
    }
  })

  const spotlightState = createSpotlightTourState(getTour)

  // Auto-dismiss welcome screen when a query flame or shared variation is present
  createEffect(() => {
    const fq = flameFromQuery()
    if (fq?.flame || sharedVariationFromQuery()) {
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
              <Root
                adapterOptions={{
                  powerPreference: 'high-performance',
                }}
              >
                <Modal>
                  <ErrorBoundary fallback={errorHandler}>
                    <Suspense>
                      <QueryErrorToast error={queryError()} />
                      <MainWorkspace
                        flameFromQuery={flameFromQuery()}
                        sharedVariationFromQuery={sharedVariationFromQuery()}
                        flameFromWelcome={selectedFlame}
                        welcomeTracks={selectedWelcomeTracks}
                        capabilityFromHome={selectedCapability}
                        autoOpenBenchmark={benchmarkRequested}
                        autoStartBenchmark={benchmarkAuto}
                        hardwareTier={
                          // When the welcome screen is skipped, detection never
                          // runs — fall back to a sane tier so quality is set.
                          hardwareTier() ?? (skipWelcome ? 'high' : null)
                        }
                        onHardwareTierChange={setHardwareTier}
                        resetFlameFromWelcome={() => {
                          setSelectedFlame(undefined)
                          setSelectedWelcomeTracks(undefined)
                          setSelectedCapability(undefined)
                        }}
                      />
                      {/* Home overlays the workspace, which stays mounted so
                          the editor keeps its state and its canvas size. It is
                          suppressed while the welcome screen is up so first-run
                          still has a single entry point. */}
                      <Show when={activeTab() === 'home' && !showWelcome()}>
                        <HomeTab
                          onOpenFlame={(flame, tracks, capability) => {
                            // Reuses the welcome screen's hand-off path rather
                            // than adding a second way to seed the workspace.
                            batch(() => {
                              setSelectedFlame(() => flame)
                              setSelectedWelcomeTracks(() => tracks)
                              setSelectedCapability(capability)
                              setActiveTab('workspace')
                            })
                          }}
                        />
                      </Show>
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
                        onBrowseGallery={() => {
                          // Both flips are required: Home is suppressed while
                          // the welcome screen is showing (see the Show above),
                          // so dismissing without switching lands in the editor
                          // and switching without dismissing shows nothing.
                          batch(() => {
                            setActiveTab('home')
                            setShowWelcome(false)
                          })
                        }}
                        onSelectFlame={(flame, tracks) => {
                          batch(() => {
                            setSelectedFlame(() => flame)
                            setSelectedWelcomeTracks(() => tracks)
                            // Picking a flame means "take me to the editor".
                            // Force the workspace tab so a stray #home in the
                            // URL can't leave Home overlaying the flame the
                            // user just chose.
                            setActiveTab('workspace')
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
                  </ErrorBoundary>
                </Modal>
              </Root>
              <ToastHost />
            </ToastProvider>
          </KeyframeTargetProvider>
        </ThemeContextProvider>
      </SpotlightTourContext.Provider>
    </CompactModeProvider>
  )
}
