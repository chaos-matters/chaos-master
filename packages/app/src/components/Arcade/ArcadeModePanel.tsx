import { createSignal, For, Match, onMount, Show, Switch } from 'solid-js'
import { clampDuelSeconds, DEFAULT_DUEL_SECONDS, MAX_DUEL_SECONDS, MIN_DUEL_SECONDS, } from '@/arcade/duel'
import { beginDuel } from '@/arcade/duelActions'
import { CINEMA_PRESETS, cinemaPromptCard, duelPromptCard, LESSON_TOPICS, teachPromptCard, TOPIC_IDS, } from '@/arcade/topics'
import { variationTypesFor } from '@/flame/variationRegistry'
import { Copy, Cross, Swords } from '@/icons'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import ui from './ArcadeHub.module.css'
import type { DuelStartFrom } from '@/arcade/duelActions'
import type { TopicId } from '@/arcade/topics'
import type { Dims } from '@/flame/variationRegistry'
import type { ArcadeMode } from '@/lib/activeTab'

/**
 * Whether the hub offers a duel with nobody in the other seat.
 *
 * On under `pnpm dev`, and behind `VITE_SOLO_DUEL=1` for a preview build, so
 * the split screen can be inspected on a deploy without shipping a duel with
 * no opponent to the people the Arcade is actually for.
 */
const SOLO_DUEL_AVAILABLE =
  import.meta.env.DEV || Boolean(import.meta.env.VITE_SOLO_DUEL)

const TITLES: Record<ArcadeMode, string> = {
  teach: 'Teach',
  cinema: 'Cinema',
  duel: 'Duel',
  beats: 'Beats',
}

const STEPS = [
  'Copy the prompt and paste it into your agent chat (ChatGPT sidebar or Chrome).',
  'The agent takes the controls; the editor locks and records every step.',
  'When it finishes, replay the session, export a video, or keep building.',
]

function PromptCard(props: { text: string }) {
  const [copied, setCopied] = createSignal(false)
  let textEl: HTMLPreElement | undefined
  const copy = async () => {
    try {
      await window.navigator.clipboard.writeText(props.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // No clipboard permission (or an insecure origin): select the text so
      // the reader can still copy it by hand rather than losing the prompt.
      if (textEl) window.getSelection()?.selectAllChildren(textEl)
    }
  }
  return (
    <div class={ui.prompt} data-testid="prompt-card">
      <pre class={ui.promptText} ref={textEl}>
        {props.text}
      </pre>
      <button
        type="button"
        class={ui.copy}
        onClick={() => void copy()}
        aria-label="Copy prompt to clipboard"
      >
        <Copy aria-hidden="true" />
        {copied() ? 'Copied' : 'Copy prompt'}
      </button>
    </div>
  )
}

export function ArcadeModePanel(props: {
  mode: ArcadeMode
  onClose: () => void
}) {
  const [topic, setTopic] = createSignal<TopicId>('variations')
  const [description, setDescription] = createSignal('')
  // The field holds text while it is being typed; the clock is what that text
  // means, clamped to the same range the tool clamps to, so the prompt card
  // can never promise a duration the tool will silently override.
  const [duelSecondsText, setDuelSecondsText] = createSignal(
    String(DEFAULT_DUEL_SECONDS),
  )
  const duelSeconds = () => clampDuelSeconds(duelSecondsText())
  const [startFrom, setStartFrom] = createSignal<DuelStartFrom>('current')
  /**
   * What a duel would run on right now.
   *
   * Only the agent starts a duel, on whatever the viewer has open, so without
   * this the dimension of the duel about to begin is a surprise. Reads the
   * same bridge the solo button reads.
   */
  const loadedDimensions = (): Dims =>
    getWebMcpContext('player')?.flameDescriptor().renderSettings.dimensions ===
    3
      ? 3
      : 2
  const duelDimensions = (): Dims =>
    startFrom() === 'random-3d'
      ? 3
      : startFrom() === 'random-2d'
        ? 2
        : loadedDimensions()
  const [soloError, setSoloError] = createSignal<string>()
  /**
   * The hub is mounted beside the workspace rather than inside it, so it has
   * no `CommandContext` to be handed one. It reads the same bridge the WebMCP
   * tools read, which exists for exactly this: a duel is started by things
   * that have no component to mount into.
   */
  const startSolo = () => {
    const ctx = getWebMcpContext('player')
    if (!ctx) {
      setSoloError('The flame editor has not finished loading.')
      return
    }
    const started = beginDuel(ctx, {
      seconds: duelSeconds(),
      startFrom: startFrom(),
      opponent: 'none',
    })
    setSoloError('error' in started ? started.error : undefined)
  }
  let closeButton: HTMLButtonElement | undefined
  onMount(() => {
    closeButton?.focus()
  })
  const ready = () =>
    props.mode === 'teach' || props.mode === 'cinema' || props.mode === 'duel'
  const prompt = () =>
    props.mode === 'teach'
      ? teachPromptCard(topic())
      : props.mode === 'duel'
        ? duelPromptCard(duelSeconds(), startFrom(), duelDimensions())
        : cinemaPromptCard(description())
  return (
    <aside
      class={ui.panel}
      role="dialog"
      aria-modal="true"
      aria-label={`${TITLES[props.mode]} mode`}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') {
          ev.stopPropagation()
          props.onClose()
        }
      }}
    >
      <header class={ui.panelHeader}>
        <h2>{TITLES[props.mode]}</h2>
        <button
          type="button"
          ref={closeButton}
          class={ui.iconButton}
          onClick={props.onClose}
          aria-label="Close panel"
        >
          <Cross aria-hidden="true" />
        </button>
      </header>
      <Switch>
        <Match when={props.mode === 'teach'}>
          <p>
            Pick a topic. The agent builds a small example step by step,
            narrating as it goes, and the recording becomes a lesson you can
            replay.
          </p>
          <div class={ui.chips} role="radiogroup" aria-label="Lesson topic">
            <For each={TOPIC_IDS}>
              {(id) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={topic() === id}
                  classList={{
                    [ui.chip!]: true,
                    [ui.chipActive!]: topic() === id,
                  }}
                  onClick={() => setTopic(id)}
                >
                  {LESSON_TOPICS[id].title}
                </button>
              )}
            </For>
          </div>
        </Match>
        <Match when={props.mode === 'cinema'}>
          <p>
            Describe the move you want, or start from one of these. The agent
            reads your flame, keyframes it, and plays it back.
          </p>
          <div class={ui.chips} aria-label="Animation presets">
            <For each={CINEMA_PRESETS}>
              {(preset) => (
                <button
                  type="button"
                  classList={{
                    [ui.chip!]: true,
                    [ui.chipActive!]: description() === preset.wish,
                  }}
                  // Fills the field rather than replacing it: the preset is a
                  // starting sentence the viewer can edit, not a mode.
                  onClick={() => setDescription(preset.wish)}
                >
                  {preset.label}
                </button>
              )}
            </For>
          </div>
          <label class={ui.field}>
            <span>Describe the animation</span>
            <textarea
              rows={3}
              value={description()}
              onInput={(ev) => setDescription(ev.currentTarget.value)}
              placeholder="slow zoom into the core while the palette drifts from ember to violet, 8 seconds, seamless loop"
            />
          </label>
        </Match>
        <Match when={props.mode === 'duel'}>
          <p>
            You and the agent each get a flame and one clock. Paste the prompt,
            then build against it — both sides are recorded and replayable.
          </p>
          <label class={ui.field}>
            <span>Start from</span>
            <select
              value={startFrom()}
              onChange={(ev) => {
                setStartFrom(ev.currentTarget.value as DuelStartFrom)
              }}
            >
              <option value="current">The flame I have open</option>
              <option value="random-2d">A random 2D flame</option>
              <option value="random-3d">A random 3D flame</option>
            </select>
          </label>
          {/* What the duel would run on, as pills: the dimension, the camera
              it brings, and the catalogue counted from the registry itself. */}
          <ul class={ui.setupPills} aria-label="Duel setup">
            <li
              class={`${ui.setupPill} ${ui.setupDims}`}
              classList={{ [ui.setupPill3D!]: duelDimensions() === 3 }}
            >
              {duelDimensions() === 3 ? '3D' : '2D'}
            </li>
            <li class={ui.setupPill}>
              {duelDimensions() === 3
                ? 'Orbit camera per side'
                : 'Pan and zoom'}
            </li>
            <li class={ui.setupPill}>
              {variationTypesFor(duelDimensions()).length} variations
            </li>
          </ul>
          <label class={ui.field}>
            <span>Clock, in seconds</span>
            <input
              type="number"
              min={MIN_DUEL_SECONDS}
              max={MAX_DUEL_SECONDS}
              value={duelSecondsText()}
              // Kept as text while it is being typed. `Number(v) || DEFAULT`
              // snapped the field back mid-keystroke the moment it was empty,
              // so it could never be cleared and retyped — and it clamped
              // nothing, so the prompt card could promise a duration the tool
              // would silently override.
              onInput={(ev) => {
                setDuelSecondsText(ev.currentTarget.value)
              }}
              onBlur={() => {
                setDuelSecondsText(String(duelSeconds()))
              }}
            />
          </label>
          <Show when={SOLO_DUEL_AVAILABLE}>
            <div class={ui.solo}>
              <button
                type="button"
                class={ui.soloButton}
                onClick={startSolo}
                data-testid="solo-duel"
              >
                <Swords aria-hidden="true" />
                Start without the agent
              </button>
              <p class={ui.soloNote}>
                Dev build only. Opens the split screen with the other seat left
                empty, so the duel can be used and looked at without a chat
                connected. Nothing is recorded and nothing reaches your library;
                the clock, the dial and the End button all behave as they do in
                a real duel.
              </p>
              <Show when={soloError()}>
                {(message) => <p class={ui.soloError}>{message()}</p>}
              </Show>
            </div>
          </Show>
        </Match>
        <Match when={!ready()}>
          <p>
            {TITLES[props.mode]} is on the roadmap: it arrives after the
            hackathon build. Teach and Cinema are live today.
          </p>
        </Match>
      </Switch>
      <Show when={ready()}>
        <PromptCard text={prompt()} />
        <ol class={ui.steps}>
          <For each={STEPS}>{(step) => <li>{step}</li>}</For>
        </ol>
      </Show>
    </aside>
  )
}
