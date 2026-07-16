import { createMemo, createSignal, For, Show } from 'solid-js'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { FLAME_GALLERY } from '@/flame/flameGalleryData'
import { parseFlameXml } from '@/flame/flameXml'
import { renderSettingsDefault } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { persistentSignal } from '@/utils/persistentSignal'
import ui from './FlameGallery.module.css'
import type { GalleryEntry } from '@/flame/flameGalleryData'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// ── Recently loaded tracking ──────────────────────────────────────────────

interface RecentEntry {
  name: string
  flameJson: string
  loadedAt: number
}

const MAX_RECENTS = 5
const [recentEntries, setRecentEntries] = persistentSignal<RecentEntry[]>(
  'flameGalleryRecents',
  [],
)

function recordRecent(entry: GalleryEntry) {
  const flame =
    entry.source === 'xml' && entry.xml
      ? parseFlameXml(entry.xml)
      : entry.descriptor
  if (!flame) return
  const prev = recentEntries()
  const existing = prev.findIndex((r) => r.name === entry.name)
  const r: RecentEntry = {
    name: entry.name,
    flameJson: JSON.stringify(flame),
    loadedAt: Date.now(),
  }
  const next =
    existing >= 0
      ? [r, ...prev.slice(0, existing), ...prev.slice(existing + 1)]
      : [r, ...prev]
  setRecentEntries(next.slice(0, MAX_RECENTS))
}

// ── Tag extraction ────────────────────────────────────────────────────────

const ALL_TAGS = [...new Set(FLAME_GALLERY.flatMap((e) => e.tags))].sort()
// Only show tags that appear in ≥ 2 entries — single-use tags add noise
const FILTER_TAGS = ALL_TAGS.filter(
  (tag) => FLAME_GALLERY.filter((e) => e.tags.includes(tag)).length >= 2,
)

/** Preview resolution by hardware tier */
const PREVIEW_SIZE: Record<string, { width: number; height: number }> = {
  low: { width: 200, height: 112 },
  mid: { width: 300, height: 168 },
  high: { width: 400, height: 225 },
  ultra: { width: 520, height: 292 },
}

function previewSize(tier: string | undefined | null) {
  return PREVIEW_SIZE[tier ?? 'mid'] ?? PREVIEW_SIZE.mid
}

export function FlameGallery(props: {
  onApply: (flame: FlameDescriptor) => void
  hardwareTier?: string | null
  respond: () => void
}) {
  const [activeTag, setActiveTag] = createSignal<string | null>(null)
  const [searchQuery, setSearchQuery] = createSignal('')
  const [entries] = createSignal<GalleryEntry[]>(FLAME_GALLERY)

  const filteredEntries = createMemo(() => {
    const tag = activeTag()
    const q = searchQuery().toLowerCase().trim()
    let list = entries()
    if (tag) list = list.filter((e) => e.tags.includes(tag))
    if (q) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    return list
  })

  const handleApply = (entry: GalleryEntry) => {
    let flame: FlameDescriptor
    if (entry.source === 'xml' && entry.xml) {
      flame = parseFlameXml(entry.xml)
    } else if (entry.source === 'native' && entry.descriptor) {
      flame = deepClone(entry.descriptor)
    } else {
      return
    }
    recordRecent(entry)
    props.onApply(flame)
    props.respond()
  }

  const handleRandom = () => {
    const list = filteredEntries()
    const idx = Math.floor(Math.random() * list.length)
    const entry = list[idx]
    if (entry) handleApply(entry)
  }

  const toggleTag = (tag: string) => {
    setActiveTag((prev) => (prev === tag ? null : tag))
  }

  const size = createMemo(() => previewSize(props.hardwareTier)!)

  const recents = createMemo<{ entry: GalleryEntry; flame: FlameDescriptor }[]>(
    () => {
      return recentEntries()
        .map((r) => {
          try {
            const flame = JSON.parse(r.flameJson) as FlameDescriptor
            const entry: GalleryEntry = {
              id: `recent-${r.loadedAt}`,
              name: r.name,
              description: `Loaded ${new Date(r.loadedAt).toLocaleDateString()}`,
              tags: [],
              source: 'native' as const,
              descriptor: flame,
            }
            return { entry, flame }
          } catch {
            return null
          }
        })
        .filter(
          (v): v is { entry: GalleryEntry; flame: FlameDescriptor } =>
            v !== null,
        )
    },
  )

  return (
    <div class={ui.overlay} onClick={props.respond}>
      <div
        class={ui.card}
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        {/* ── Header ──────────────────────────── */}
        <div class={ui.header}>
          <div class={ui.headerLeft}>
            <span class={ui.title}>Flame Gallery</span>
            <span class={ui.count}>
              {filteredEntries().length}
              {activeTag() ? ` matching "${activeTag()}"` : ' classics'}
            </span>
          </div>
          <div class={ui.toolbar}>
            <input
              type="text"
              class={ui.searchInput}
              placeholder="Search…"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <button class={ui.randomBtn} onClick={handleRandom}>
              Random
            </button>
          </div>
        </div>

        {/* ── Tag cloud ────────────────────────── */}
        <div class={ui.tagCloud}>
          <Show when={activeTag() || searchQuery()}>
            <button
              type="button"
              class={`${ui.tagChip} ${ui.tagChipClear}`}
              onClick={() => {
                setActiveTag(null)
                setSearchQuery('')
              }}
            >
              Clear filter
            </button>
          </Show>
          <For each={FILTER_TAGS}>
            {(tag) => {
              const count = () =>
                entries().filter((e) => e.tags.includes(tag)).length
              return (
                <button
                  type="button"
                  class={ui.tagChip}
                  classList={{ [ui.tagChipActive!]: activeTag() === tag }}
                  onClick={() => {
                    toggleTag(tag)
                  }}
                >
                  {tag} ({count()})
                </button>
              )
            }}
          </For>
        </div>

        <div class={ui.scrollBody}>
          {/* ── Recents section ────────────────── */}
          <Show when={recents().length > 0}>
            <div class={ui.sectionHeader}>
              <span class={ui.sectionTitle}>Recently Loaded</span>
            </div>
            <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
              <div class={ui.grid}>
                <For each={recents()}>
                  {(r) => (
                    <Cell
                      entry={r.entry}
                      width={size().width}
                      height={size().height}
                      onApply={() => {
                        handleApply(r.entry)
                      }}
                    />
                  )}
                </For>
              </div>
            </ComputeGate>
          </Show>

          {/* ── Curated grid ───────────────────── */}
          <Show
            when={filteredEntries().length > 0}
            fallback={
              <div class={ui.empty}>
                No flames match the tag "{activeTag()}".
              </div>
            }
          >
            <div class={ui.sectionHeader}>
              <span class={ui.sectionTitle}>Curated Classics</span>
            </div>
            <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
              <div class={ui.grid}>
                <For each={filteredEntries()}>
                  {(entry) => (
                    <Cell
                      entry={entry}
                      width={size().width}
                      height={size().height}
                      onApply={() => {
                        handleApply(entry)
                      }}
                    />
                  )}
                </For>
              </div>
            </ComputeGate>
          </Show>
        </div>

        {/* ── Footer ──────────────────────────── */}
        <div class={ui.footer}>
          <span class={ui.hint}>
            Click a flame to load it into the workspace · Curated classics from
            the flame fractal community
          </span>
          <button class={ui.closeBtn} onClick={props.respond}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/** Single gallery cell with cached VariationPreview */
function Cell(props: {
  entry: GalleryEntry
  width: number
  height: number
  onApply: () => void
}) {
  const flame = createMemo<FlameDescriptor>(() => {
    const e = props.entry
    if (e.source === 'xml' && e.xml) {
      try {
        return parseFlameXml(e.xml)
      } catch {
        // Return a minimal valid fallback on parse failure
        return {
          version: '1.0' as const,
          metadata: { author: 'unknown', name: e.name, description: '' },
          renderSettings: { ...renderSettingsDefault, exposure: 1 },
          transforms: {},
        }
      }
    }
    return deepClone(e.descriptor!)
  })

  return (
    <div class={ui.cell} onClick={props.onApply}>
      <div class={ui.previewArea}>
        <Show when={flame()}>
          {(f) => (
            <VariationPreview
              version={0}
              isSelected={false}
              flame={f()}
              name={props.entry.name}
              resolution={{
                width: props.width,
                height: props.height,
              }}
            />
          )}
        </Show>
      </div>
      <div class={ui.info}>
        <span class={ui.cellName}>{props.entry.name}</span>
        <span class={ui.cellDesc}>{props.entry.description}</span>
        <div class={ui.tags}>
          <For each={props.entry.tags}>
            {(tag) => <span class={ui.tag}>{tag}</span>}
          </For>
        </div>
      </div>
    </div>
  )
}
