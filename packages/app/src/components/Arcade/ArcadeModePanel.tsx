import { createSignal, For, Match, onMount, Show, Switch } from 'solid-js'
import { cinemaPromptCard, LESSON_TOPICS, teachPromptCard, TOPIC_IDS, } from '@/arcade/topics'
import { Copy, Cross } from '@/icons'
import ui from './ArcadeHub.module.css'
import type { TopicId } from '@/arcade/topics'
import type { ArcadeMode } from '@/lib/activeTab'

const TITLES: Record<ArcadeMode, string> = {
  teach: 'Teach',
  cinema: 'Cinema',
  duel: 'Duel',
  beats: 'Beats',
}

const STEPS = [
  'Copy the prompt and paste it into your AI chat (ChatGPT sidebar or Chrome).',
  'The AI takes the controls; the editor locks and records every step.',
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
  let closeButton: HTMLButtonElement | undefined
  onMount(() => {
    closeButton?.focus()
  })
  const ready = () => props.mode === 'teach' || props.mode === 'cinema'
  const prompt = () =>
    props.mode === 'teach'
      ? teachPromptCard(topic())
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
            Pick a topic. The AI builds a small example step by step, narrating
            as it goes, and the recording becomes a lesson you can replay.
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
            Describe the move you want. The AI reads your flame, keyframes it,
            and plays it back.
          </p>
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
