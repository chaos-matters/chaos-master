import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { Discord, Download, Share, TriangleAlert } from '@/icons'
import { trackDiscordShare } from '@/lib/telemetry'
import { persistentSignal } from '@/utils/persistentSignal'
import { loadTurnstile, TURNSTILE_SITE_KEY } from '@/utils/turnstile'
import { Button } from '../Button/Button'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './DiscordShare.module.css'
import type { DiscordShareResult } from '@/lib/communityShowcase'

const CANCEL = Symbol('cancel')

export type DiscordShareMeta = {
  author: string
  title: string
  submitToShowcase: boolean
}

type DiscordShareModalProps = {
  previewUrl: string
  respond: (value: DiscordShareResult | typeof CANCEL) => void
  initialMetadata?: { name?: string; author?: string }
  /** Performs the actual upload and reports whether showcase staging succeeded. */
  onShare: (
    meta: DiscordShareMeta,
    token: string,
  ) => Promise<DiscordShareResult | undefined>
  showcaseEligible: boolean
  showcaseUnavailableReason?: string
  /** Fallback: download the captured PNG (with embedded flame data). */
  onDownload: () => void
  /** Fallback: copy a share link; resolves `true` when copied. */
  onCopyLink: () => Promise<boolean>
  /** Where the "Open Discord" fallback link points. */
  discordUrl: string
}

type Phase = 'form' | 'sending' | 'failed'

export function DiscordShareModal(props: DiscordShareModalProps) {
  const [storedAuthor, setStoredAuthor] = persistentSignal('discord/author', '')
  const [author, setAuthor] = createSignal(
    props.initialMetadata?.author && props.initialMetadata.author !== 'unknown'
      ? props.initialMetadata.author
      : storedAuthor() || '',
  )
  const [title, setTitle] = createSignal(props.initialMetadata?.name ?? '')
  const [attempted, setAttempted] = createSignal(false)
  const [phase, setPhase] = createSignal<Phase>('form')
  const [token, setToken] = createSignal('')
  const [copied, setCopied] = createSignal(false)
  const [submitToShowcase, setSubmitToShowcase] = createSignal(false)

  const authorTrimmed = () => author().trim()
  const titleTrimmed = () => title().trim()
  const showError = () => attempted() && authorTrimmed() === ''

  // Turnstile is only enforced when a site key is configured. Without one
  // (local dev), sharing proceeds with an empty token and the Worker — which
  // also only verifies when its secret is set — lets it through.
  const turnstileEnabled = () => Boolean(TURNSTILE_SITE_KEY)
  const hasToken = () => !turnstileEnabled() || token() !== ''

  let turnstileEl: HTMLDivElement | undefined
  let widgetId: string | undefined

  onMount(() => {
    if (!turnstileEnabled() || !turnstileEl) return
    void loadTurnstile()
      .then(() => {
        if (!turnstileEl || !window.turnstile) return
        widgetId = window.turnstile.render(turnstileEl, {
          sitekey: TURNSTILE_SITE_KEY!,
          theme: 'auto',
          size: 'flexible',
          callback: (t) => {
            setToken(t)
          },
          'expired-callback': () => {
            setToken('')
          },
          'error-callback': () => {
            setToken('')
          },
          'timeout-callback': () => {
            setToken('')
          },
        })
      })
      .catch(() => {
        // Script blocked/failed — leave the widget empty; the Worker stays the
        // authority and will reject if it requires a token.
      })
  })

  onCleanup(() => {
    if (widgetId && window.turnstile) {
      try {
        window.turnstile.remove(widgetId)
      } catch {
        // ignore
      }
    }
  })

  function resetTurnstile() {
    setToken('')
    if (widgetId && window.turnstile) {
      try {
        window.turnstile.reset(widgetId)
      } catch {
        // ignore
      }
    }
  }

  async function submit() {
    setAttempted(true)
    if (authorTrimmed() === '' || !hasToken() || phase() === 'sending') return
    setStoredAuthor(authorTrimmed())
    setPhase('sending')
    let result: DiscordShareResult | undefined
    try {
      result = await props.onShare(
        {
          author: authorTrimmed(),
          title: titleTrimmed(),
          submitToShowcase: props.showcaseEligible && submitToShowcase(),
        },
        token(),
      )
    } catch {
      result = undefined
    }
    if (result !== undefined) {
      trackDiscordShare()
      props.respond(result)
    } else {
      // A token is single-use once verified — force a fresh solve on retry.
      resetTurnstile()
      setPhase('failed')
    }
  }

  // Track the "Copied!" reset timer so it can't fire after the modal closes
  // (a no-op write on a disposed scope) and so rapid re-copies don't stack.
  let copiedResetTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    clearTimeout(copiedResetTimer)
  })

  async function copyLink() {
    const ok = await props.onCopyLink()
    if (ok) {
      setCopied(true)
      clearTimeout(copiedResetTimer)
      copiedResetTimer = setTimeout(() => setCopied(false), 2000)
    }
  }

  // Manual share options (download the embedded PNG / copy a link / open
  // Discord). Always reachable so a user is never stuck when the bot check
  // can't solve or the direct post fails.
  function manualActions() {
    return (
      <div class={ui.fallbackActions}>
        <button
          class={ui.fallbackButton}
          onClick={() => {
            props.onDownload()
          }}
        >
          <Download />
          Download image
        </button>
        <button class={ui.fallbackButton} onClick={copyLink}>
          <Share />
          {copied() ? 'Link copied' : 'Copy share link'}
        </button>
        <a
          class={ui.fallbackButton}
          href={props.discordUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Discord />
          Open Discord
        </a>
      </div>
    )
  }

  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(CANCEL)
        }}
      >
        Share to Discord
      </ModalTitleBar>
      <div class={ui.content}>
        {/* Preview: image + caption below */}
        <div class={ui.preview}>
          <img
            class={ui.previewImage}
            src={props.previewUrl}
            alt="Flame preview"
          />
        </div>

        <Show
          when={phase() !== 'failed'}
          fallback={
            <div class={ui.fallback}>
              <div class={ui.fallbackHeader}>
                <TriangleAlert />
                Couldn't post to Discord
              </div>
              <p class={ui.fallbackMsg}>
                The automatic post didn't go through — the server may be
                unreachable, rate-limited, or the bot check didn't pass. You can
                still share it manually: the image has the flame embedded, so
                anyone who opens it can load it back into the app.
              </p>
              {manualActions()}
            </div>
          }
        >
          {/* Author field */}
          <div class={ui.field}>
            <label class={ui.fieldLabel} for="discord-share-author">
              Author <span class={ui.required}>*</span>
            </label>
            <input
              id="discord-share-author"
              class={ui.input}
              classList={{ [ui.inputError as string]: showError() }}
              type="text"
              placeholder="Your name"
              value={author()}
              autofocus
              onInput={(e) => {
                setAuthor(e.currentTarget.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
            />
            <Show when={showError()}>
              <span class={ui.errorHint}>A name is required to share.</span>
            </Show>
          </div>

          {/* Title field */}
          <div class={ui.field}>
            <label class={ui.fieldLabel} for="discord-share-title">
              Title <span class={ui.optional}>(optional)</span>
            </label>
            <input
              id="discord-share-title"
              class={ui.input}
              type="text"
              placeholder="Name your flame"
              value={title()}
              onInput={(e) => {
                setTitle(e.currentTarget.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
            />
          </div>

          <Show
            when={props.showcaseEligible}
            fallback={
              <p class={ui.showcaseUnavailable}>
                {props.showcaseUnavailableReason ??
                  'This flame cannot be submitted to the Home showcase yet.'}
              </p>
            }
          >
            <label class={ui.showcaseOption}>
              <input
                type="checkbox"
                checked={submitToShowcase()}
                onChange={(event) => {
                  setSubmitToShowcase(event.currentTarget.checked)
                }}
              />
              <span>
                <strong>Submit to the Home showcase</strong>
                <small>
                  Allow Lumen Apeiron to feature this flame and your public
                  author credit after moderation, where visitors can open and
                  remix its editable source. You can ask us to remove it.
                </small>
              </span>
            </label>
          </Show>

          <Show when={turnstileEnabled()}>
            <div class={ui.turnstile} ref={turnstileEl} />
          </Show>

          {/* Escape hatch: if the bot check won't solve, the user can still get
              the image / link without being stuck on a disabled Share button. */}
          <details class={ui.manualDetails}>
            <summary class={ui.manualSummary}>
              Can't complete the check? Share manually
            </summary>
            {manualActions()}
          </details>
        </Show>
      </div>
      <footer class={ui.footer}>
        <Show
          when={phase() !== 'failed'}
          fallback={
            <Button
              onClick={() => {
                props.respond(CANCEL)
              }}
            >
              Close
            </Button>
          }
        >
          <Button
            onClick={() => {
              props.respond(CANCEL)
            }}
          >
            Cancel
          </Button>
          <button
            class={ui.shareButton}
            disabled={phase() === 'sending' || !hasToken()}
            onClick={() => void submit()}
          >
            <Discord />
            {phase() === 'sending' ? 'Sharing...' : 'Share'}
          </button>
        </Show>
      </footer>
    </>
  )
}

export function createDiscordShareModal() {
  const requestModal = useRequestModal()

  async function showDiscordShareModal(opts: {
    previewUrl: string
    initialMetadata?: { name?: string; author?: string }
    onShare: (
      meta: DiscordShareMeta,
      token: string,
    ) => Promise<DiscordShareResult | undefined>
    showcaseEligible?: boolean
    showcaseUnavailableReason?: string
    onDownload: () => void
    onCopyLink: () => Promise<boolean>
    discordUrl: string
  }): Promise<DiscordShareResult | undefined> {
    const result = await requestModal<DiscordShareResult | typeof CANCEL>({
      class: ui.container,
      content: ({ respond }) => (
        <DiscordShareModal
          previewUrl={opts.previewUrl}
          respond={respond}
          initialMetadata={opts.initialMetadata}
          onShare={opts.onShare}
          showcaseEligible={opts.showcaseEligible ?? true}
          showcaseUnavailableReason={opts.showcaseUnavailableReason}
          onDownload={opts.onDownload}
          onCopyLink={opts.onCopyLink}
          discordUrl={opts.discordUrl}
        />
      ),
    })
    return result === CANCEL ? undefined : result
  }

  return { showDiscordShareModal }
}
