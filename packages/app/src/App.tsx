import { batch, createEffect, createResource, createSignal, ErrorBoundary, lazy, onCleanup, onMount, Show, Suspense, } from 'solid-js'
import { ArcadeHub } from './components/Arcade/ArcadeHub'
import { AppCrashed, WebgpuNotSupported, } from './components/ErrorHandling/ErrorHandling'
import { HomeTab } from './components/Home/HomeTab'
import { Modal } from './components/Modal/Modal'
import { NativeSaveToasts } from './components/NativeSaveToasts/NativeSaveToasts'
import { HomeShellBar } from './components/Shell/HomeShellBar'
import { ToastHost } from './components/Toast/Toast'
import { WelcomeScreen } from './components/WelcomeScreen/WelcomeScreen'
import { WorkspaceSkeleton } from './components/WorkspaceSkeleton'
import { CompactModeProvider } from './contexts/CompactModeContext'
import { KeyframeTargetProvider } from './contexts/KeyframeTargetContext'
import { createSpotlightTourState, SpotlightTourContext, } from './contexts/SpotlightTourContext'
import { ThemeContextProvider } from './contexts/ThemeContext'
import { ToastProvider, useToast } from './contexts/ToastContext'
import { IS_DEV } from './defaults'
import { initAncestry } from './flame/ancestry'
import { importSharedVariations, loadCustomVariations, remapFlameCustomVariations, } from './flame/variations/custom'
import { activeTab, arcadeMode, setActiveTab, tabFromHash, } from './lib/activeTab'
import { createBackLayer } from './lib/backStack'
import { migrateLegacyDraft, reopenTarget, takePauseSaveEviction, takePauseSaveFailure, } from './lib/pauseSave'
import { IS_NATIVE } from './lib/platform'
import { Root } from './lib/Root'
import { createWorkspaceHandoff } from './lib/workspaceHandoff'

const MainWorkspace = lazy(() =>
  import('./MainWorkspace').then((m) => ({ default: m.MainWorkspace })),
)
import { getTour } from './tours/registry'
import { isBenchmarkAuto, isBenchmarkRequested } from './utils/benchmarkRequest'
import { decodeSharePayload, decodeVariationShare, } from './utils/jsonQueryParam'
import { persistentSignal } from './utils/persistentSignal'
import { recordKeys } from './utils/record'
import { dismissWelcome, hasWelcomeBeenDismissed, } from './utils/welcomeDismissed'
import type { HardwareTier } from './utils/hardwareTier'

export type { ExportImageInfo, ExportImageType } from './flame/exportImageType'

/** Shows a message once it is set. Lives inside the ToastProvider, which is
 *  why it is a component rather than a call in Wrappers' body. */
function MessageToast(props: { message: string | null }) {
  const { showToast } = useToast()
  createEffect(() => {
    if (props.message) {
      showToast(props.message)
    }
  })
  return null
}

/**
 * The one thing a launch has to say for itself.
 *
 * The native app saves the open document when the OS backgrounds it, and a
 * refusal there cannot be reported at the time: the process is ending and a
 * toast nobody sees is the same as silence. So it is carried here
 * (lib/pauseSave.ts). Nothing is claimed about where the flame is, because it
 * is nowhere - that is what the message is for.
 */
const PAUSE_SAVE_REFUSED =
  'The flame you had open when the app last closed was not saved: this device refused to store it.'

/**
 * What a launch says when it puts the last document back on screen.
 *
 * Deliberately says nothing about saving. The work reached Recents when the
 * OS backgrounded the app, so this is only about where the user has landed -
 * and a launch that reopens nothing says nothing at all, because there is
 * nothing wrong with it.
 */
const REOPENED = 'Reopened the flame you were last working on.'

/**
 * What a launch says about a flame the last pause write had to replace.
 *
 * Recents was full and the open document existed nowhere else, so the write
 * forced past the cap and the oldest kept flame gave way. That trade is
 * sanctioned - the process may have been ending - but it is the app deleting
 * something the user chose to keep, without asking, and an Android pause is
 * as often a share sheet as a force-stop. So it is named (lib/pauseSave.ts).
 */
const evictionNotice = (name: string) =>
  `Recents was full when the app last closed, so saving the flame you had open replaced the oldest one, "${name}".`

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
  const [queryError, setQueryError] = createSignal<string | null>(null)
  const [launchNotice, setLaunchNotice] = createSignal<string | null>(null)

  /**
   * Everything the workspace is seeded with, in one place: the flame, the
   * tracks and the timeline it arrives with, and the capability a Home card
   * asked to open with it (lib/workspaceHandoff.ts). MainWorkspace reads
   * them in one effect and clears the lot.
   */
  const handoff = createWorkspaceHandoff({
    enterWorkspace: () => {
      setActiveTab('workspace')
    },
  })
  const seedWorkspace = handoff.seed

  /**
   * What the launch owes the last session.
   *
   * Nothing is restored here, because nothing needs rescuing: the native app
   * writes the open document straight into Recents when the OS backgrounds
   * it, so by the time a cold start runs the work is already on the shelf the
   * Library shows (lib/pauseSave.ts).
   *
   * What is left is where to put the user. The pause write recorded which
   * entry it made, and this opens it - an ordinary seeding, the same one a
   * Home card or the welcome grid does, over work that is safe either way. It
   * takes no precedence and holds nothing back: a tap on a starter flame that
   * gets to the hand-off first wins it, and the flame this would have opened
   * stays in the Library.
   *
   * Plus a one-time move for anyone upgrading with the old crash slot still
   * populated, and the one thing a pause cannot say at the time it happens.
   */
  onMount(() => {
    migrateLegacyDraft()
    // Said together in one toast rather than one after another: a launch has
    // at most a sentence of the user's attention, and a second toast would
    // evict the first from a column that holds four.
    const notices: string[] = []
    if (takePauseSaveFailure()) notices.push(PAUSE_SAVE_REFUSED)
    const evicted = takePauseSaveEviction()
    if (evicted !== undefined) notices.push(evictionNotice(evicted))
    const reopen = reopenTarget(IS_NATIVE)
    if (reopen) {
      // No `enterWorkspace`: the editor is already the tab a launch lands on,
      // and forcing it would drag a `#home` or `#arcade` link out of the
      // destination it asked for.
      seedWorkspace({
        flame: reopen.flame,
        ...(reopen.tracks ? { tracks: reopen.tracks } : {}),
        ...(reopen.config ? { config: reopen.config } : {}),
      })
      notices.push(REOPENED)
    }
    if (notices.length > 0) setLaunchNotice(notices.join(' '))
  })

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
        setQueryError(
          'Failed to decode the shared fractal. The link may be malformed or corrupted.',
        )
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

  // Support #tour=app|sidebar|timeline and #arcade hash URLs
  createEffect(() => {
    const handleHashChange = () => {
      const fragment = window.location.hash
      // `lumenapeiron.com/arcade` redirects here. Landing a judge on the
      // generic welcome screen instead of the hub loses them: neither
      // "Browse gallery" nor picking a flame ever comes back to the Arcade.
      if (tabFromHash(fragment) === 'arcade') {
        setShowWelcome(false)
      }
      const match = /#tour=([a-zA-Z0-9_-]+)/.exec(fragment)
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

  // Home and the Arcade are destinations over the editor, so back returns to
  // Create before the app minimises (lib/backStack.ts). Escape keeps its own
  // path through installHomeEscapeBoundary: two keys, one result.
  createBackLayer(
    () => activeTab() === 'home' && !showWelcome(),
    () => {
      setActiveTab('workspace')
    },
    'home',
  )

  createBackLayer(
    () => activeTab() === 'arcade',
    () => {
      setActiveTab('workspace')
    },
    'arcade',
  )

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
              <NativeSaveToasts />
              {/* Outside the Suspense below on purpose: an effect inside a
                  suspended boundary does not run until the boundary resolves,
                  so this notice waited on the workspace chunk and on the
                  share-link resource - while the one moment it is needed is
                  the moment the launch restores something, with the welcome
                  grid still up and a starter flame one tap away. The toast
                  column sits above the welcome screen's own layer. */}
              <MessageToast message={launchNotice()} />
              <Root
                adapterOptions={{
                  powerPreference: 'high-performance',
                }}
              >
                <Modal>
                  <ErrorBoundary fallback={errorHandler}>
                    <Suspense fallback={<WorkspaceSkeleton />}>
                      <MessageToast message={queryError()} />
                      <MainWorkspace
                        flameFromQuery={flameFromQuery()}
                        sharedVariationFromQuery={sharedVariationFromQuery()}
                        flameFromWelcome={handoff.flame}
                        welcomeTracks={handoff.tracks}
                        welcomeConfig={handoff.config}
                        capabilityFromHome={handoff.capability}
                        autoOpenBenchmark={benchmarkRequested}
                        autoStartBenchmark={benchmarkAuto}
                        hardwareTier={
                          // When the welcome screen is skipped, detection never
                          // runs — fall back to a sane tier so quality is set.
                          hardwareTier() ?? (skipWelcome ? 'high' : null)
                        }
                        onHardwareTierChange={setHardwareTier}
                        resetFlameFromWelcome={() => {
                          seedWorkspace()
                        }}
                      />
                      {/* Home overlays the workspace, which stays mounted so
                          the editor keeps its state and its canvas size. It is
                          suppressed while the welcome screen is up so first-run
                          still has a single entry point. */}
                      <Show when={activeTab() === 'home' && !showWelcome()}>
                        <HomeTab
                          onOpenFlame={(flame, tracks, config, capability) => {
                            seedWorkspace({
                              flame,
                              ...(tracks ? { tracks } : {}),
                              // The timeline the row was authored at. Without
                              // it an animated gallery flame opened at the
                              // workspace defaults, 30fps over 90 frames.
                              ...(config ? { config } : {}),
                              ...(capability !== undefined
                                ? { capability }
                                : {}),
                              enterWorkspace: true,
                            })
                          }}
                        />
                        {/* Touch has no FloatingActions, so this is the way
                            back to the editor besides back and Escape. */}
                        <HomeShellBar />
                      </Show>
                      {/* The Arcade overlays the workspace the same way Home
                          does: the editor stays mounted underneath so a lesson
                          starts on the flame you were already looking at. */}
                      <Show when={activeTab() === 'arcade' && !showWelcome()}>
                        <ArcadeHub
                          initialMode={arcadeMode()}
                          onBackToEditor={() => {
                            setActiveTab('workspace')
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
                          seedWorkspace({
                            flame,
                            ...(tracks ? { tracks } : {}),
                            enterWorkspace: true,
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
