import { createResource, For, Show } from 'solid-js'
import { setActiveTab } from '@/lib/activeTab'
import { bySection, fetchGallery, fetchGalleryItem, posterUrl, } from '@/lib/galleryContent'
import ui from './HomeTab.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { GalleryListItem, GallerySection } from '@/lib/galleryContent'
import type { TimelineTrack } from '@/utils/timeline'

/**
 * Home — Phase 1 shell.
 *
 * Structure is the AABAAA combination chosen from the wireframes: left rail,
 * full-bleed hero with the statement over it, editorial-span gallery, a row of
 * motion tiles, capability cards, and the app framed as an exhibit.
 *
 * Deliberately poster-only: every plate shows a captured still or a plain
 * surface. Live GPU canvases arrive in Phase 2, once the layout is settled —
 * so this file must stay free of renderer imports.
 */

export interface HomeTabProps {
  /** Open a flame in the workspace (switches tab). */
  onOpenFlame: (flame: FlameDescriptor, tracks?: TimelineTrack[]) => void
}

const SECTIONS: { id: GallerySection | 'made'; label: string }[] = [
  { id: 'hero', label: 'Overview' },
  { id: 'gallery', label: 'The flames' },
  { id: 'motion', label: 'In motion' },
  { id: 'made', label: 'Made here' },
  { id: 'capability', label: 'Explore' },
]

/** Editorial spans: the shape of the wall, by position. */
const SPANS = [ui.span3, ui.row2, ui.span2, '', ui.span2, ui.span2]

function Plate(props: {
  item: GalleryListItem
  class?: string
  onOpen: (slug: string) => void
}) {
  const url = () => posterUrl(props.item)
  return (
    <button
      type="button"
      class={`${ui.plate} ${props.class ?? ''}`}
      onClick={() => {
        props.onOpen(props.item.slug)
      }}
      title={`Open ${props.item.title} in the workspace`}
    >
      <Show
        when={url()}
        fallback={<span class={ui.plateEmpty}>No poster yet</span>}
      >
        {(src) => (
          <img
            class={ui.plateImg}
            src={src()}
            alt={props.item.title}
            width={props.item.poster_width ?? undefined}
            height={props.item.poster_height ?? undefined}
            loading="lazy"
          />
        )}
      </Show>
      <span class={ui.plateCaption}>
        <span class={ui.plateTitle}>{props.item.title}</span>
        <span class={ui.plateMeta}>
          {props.item.dimensions}D · {props.item.transform_count} transforms
          <Show when={props.item.has_animation}> · animated</Show>
        </span>
      </span>
    </button>
  )
}

export function HomeTab(props: HomeTabProps) {
  // Wrapped rather than passed directly: createResource hands the fetcher its
  // source value, which would arrive as the section filter.
  const [content] = createResource(() => fetchGallery())
  const sections = () => bySection(content() ?? [])

  function scrollTo(id: string) {
    document.getElementById(`home-${id}`)?.scrollIntoView({ block: 'start' })
  }

  /** Fetch the descriptor on demand — the list deliberately omits it. */
  async function open(slug: string) {
    try {
      const item = await fetchGalleryItem(slug)
      props.onOpenFlame(item.flame, item.animation?.tracks)
    } catch (err) {
      console.error('Could not open gallery flame:', err)
    }
  }

  return (
    <div class={ui.home}>
      <nav class={ui.rail} aria-label="Home sections">
        <span class={ui.railBrand}>Lumen Apeiron</span>
        <For each={SECTIONS}>
          {(section) => (
            <button
              type="button"
              class={ui.railLink}
              onClick={() => {
                scrollTo(section.id)
              }}
            >
              {section.label}
            </button>
          )}
        </For>
        <button
          type="button"
          class={`${ui.railLink} ${ui.railBack}`}
          onClick={() => setActiveTab('workspace')}
        >
          Back to the editor
        </button>
      </nav>

      <div class={ui.scroll}>
        <Show
          when={!content.loading}
          fallback={<p class={ui.state}>Loading the gallery…</p>}
        >
          <Show
            when={content.error === undefined}
            fallback={
              <p class={ui.state}>
                The gallery is unavailable right now. Everything else in the app
                still works.
              </p>
            }
          >
            {/* Hero — option A */}
            <section class={ui.section} id="home-hero">
              <For each={sections().hero}>
                {(item) => (
                  <div class={ui.hero}>
                    <Show when={posterUrl(item)}>
                      {(src) => <img class={ui.plateImg} src={src()} alt="" />}
                    </Show>
                    <div class={ui.heroCopy}>
                      <div class={ui.heroText}>
                        <h1 class={ui.heroTitle}>
                          Fractal flames, rendered live in your browser
                        </h1>
                        <p class={ui.heroLede}>
                          Everything below is a real flame, not a picture of
                          one. Open any of them and it becomes yours to edit.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </section>

            {/* The flames — option B, editorial spans */}
            <section class={ui.section} id="home-gallery">
              <div class={ui.sectionHead}>
                <h2 class={ui.sectionTitle}>The flames</h2>
              </div>
              <p class={ui.sectionNote}>
                A curated wall. Each plate opens in the workspace exactly as it
                is here.
              </p>
              <div class={ui.galleryGrid}>
                <For each={sections().gallery}>
                  {(item, i) => (
                    <Plate
                      item={item}
                      class={SPANS[i() % SPANS.length]}
                      onOpen={open}
                    />
                  )}
                </For>
              </div>
            </section>

            {/* In motion — option A, row of tiles */}
            <section class={ui.section} id="home-motion">
              <div class={ui.sectionHead}>
                <h2 class={ui.sectionTitle}>In motion</h2>
              </div>
              <p class={ui.sectionNote}>
                Animated pieces. Each carries its own timeline, so opening one
                brings the animation with it.
              </p>
              <div class={ui.motionRow}>
                <For each={sections().motion}>
                  {(item) => (
                    <div style={{ height: '12rem' }}>
                      <Plate item={item} onOpen={open} />
                    </div>
                  )}
                </For>
              </div>
            </section>

            {/* Made here — option A, framed window */}
            <section class={ui.section} id="home-made">
              <div class={ui.sectionHead}>
                <h2 class={ui.sectionTitle}>Made here</h2>
              </div>
              <p class={ui.sectionNote}>
                A flame being built, start to finish, in the real editor.
              </p>
              <div class={ui.portalFrame}>
                <div class={ui.portalBar}>Lumen Apeiron</div>
                <div class={ui.portalBody}>
                  <div class={ui.plate}>
                    <span class={ui.plateEmpty}>Guided build — Phase 5</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Explore — option A, capability cards */}
            <section class={ui.section} id="home-capability">
              <div class={ui.sectionHead}>
                <h2 class={ui.sectionTitle}>Explore</h2>
              </div>
              <p class={ui.sectionNote}>
                Each card opens a flame chosen to show off one part of the app.
              </p>
              <div class={ui.cardGrid}>
                <For each={sections().capability}>
                  {(item) => (
                    <button
                      type="button"
                      class={ui.card}
                      onClick={() => void open(item.slug)}
                    >
                      <span class={ui.cardThumb}>
                        <Plate item={item} onOpen={open} />
                      </span>
                      <span class={ui.cardTitle}>{item.title}</span>
                      <Show when={item.caption}>
                        {(caption) => <p class={ui.cardCaption}>{caption()}</p>}
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </section>

            <footer class={ui.footer}>
              <a href="https://about.lumenapeiron.com/">About</a>
              <a href="/discord">Discord</a>
              <a href="https://github.com/chaos-matters/chaos-master">Source</a>
            </footer>
          </Show>
        </Show>
      </div>
    </div>
  )
}
