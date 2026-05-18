import { createResource, For, JSX, Show } from 'solid-js'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './Changelog.module.css'

type ChangelogEntry = {
  version: string
  date: string
  sections: {
    title: string
    items: string[]
  }[]
}

async function fetchChangelog(): Promise<ChangelogEntry[]> {
  const response = await fetch('/CHANGELOG.md')
  const text = await response.text()

  const entries: ChangelogEntry[] = []
  const lines = text.split('\n')

  let currentEntry: ChangelogEntry | null = null
  let currentSection: { title: string; items: string[] } | null = null

  for (const line of lines) {
    const versionMatch = line.match(/^## \[([\d.]+)\] - ([\d-]+)/)
    if (versionMatch) {
      currentEntry = {
        version: versionMatch[1]!,
        date: versionMatch[2]!,
        sections: [],
      }
      entries.push(currentEntry)
      currentSection = null
      continue
    }

    if (currentEntry) {
      const sectionMatch = line.match(/^### (\w+)/)
      if (sectionMatch) {
        currentSection = {
          title: sectionMatch[1]!,
          items: [],
        }
        currentEntry.sections.push(currentSection)
        continue
      }

      if (currentSection) {
        const itemMatch = line.match(/^- (.*)/)
        if (itemMatch) {
          currentSection.items.push(itemMatch[1]!)
        }
      }
    }
  }

  return entries
}

/**
 * Renders a plain string that may contain inline markdown:
 *   `code`  -> <code>
 *   **bold** -> <strong>
 *   _italic_ -> <em>
 */
function renderInline(text: string): JSX.Element {
  // Split on any of our recognised tokens while keeping the delimiters.
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|_[^_]+_)/)

  return (
    <>
      {parts.map((part) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code class={ui.code}>{part.slice(1, -1)}</code>
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('_') && part.endsWith('_')) {
          return <em>{part.slice(1, -1)}</em>
        }
        return <>{part}</>
      })}
    </>
  )
}

const SECTION_ACCENT: Record<string, string> = {
  Added: 'added',
  Changed: 'changed',
  Fixed: 'fixed',
  Removed: 'removed',
  Deprecated: 'deprecated',
  Security: 'security',
}

type ChangelogProps = {
  respond: () => void
}

export function Changelog(props: ChangelogProps) {
  const [entries] = createResource(fetchChangelog)

  return (
    <div class={ui.changelogContainer}>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        <span>Changelog</span>
      </ModalTitleBar>
      <div class={ui.content}>
        <Show
          when={!entries.loading}
          fallback={<div class={ui.loading}>Loading...</div>}
        >
          <For each={entries()}>
            {(entry, i) => (
              <div class={ui.entry} data-latest={i() === 0 ? '' : undefined}>
                <div class={ui.versionHeader}>
                  <div class={ui.versionLeft}>
                    <span class={ui.versionBadge}>v{entry.version}</span>
                    {i() === 0 && (
                      <span class={ui.latestBadge}>Latest</span>
                    )}
                  </div>
                  <span class={ui.date}>{entry.date}</span>
                </div>
                <For each={entry.sections}>
                  {(section) => (
                    <div class={ui.section}>
                      <h4
                        class={ui.sectionTitle}
                        data-kind={SECTION_ACCENT[section.title] ?? 'other'}
                      >
                        <span class={ui.sectionDot} />
                        {section.title}
                      </h4>
                      <ul class={ui.list}>
                        <For each={section.items}>
                          {(item) => (
                            <li class={ui.item}>{renderInline(item)}</li>
                          )}
                        </For>
                      </ul>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

export function createShowChangelog() {
  const requestModal = useRequestModal()

  async function showChangelog() {
    await requestModal({
      class: ui.changelogModal,
      content: ({ respond }) => <Changelog respond={respond} />,
    })
  }

  return showChangelog
}
