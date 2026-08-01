import { createResource, createSignal, For, Show } from 'solid-js'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { setActiveTab } from '@/lib/activeTab'
import { bySection, fetchGallery, fetchGalleryItem, needsPosterFrame, posterUrl, } from '@/lib/galleryContent'
import { createSharedIntersectionObserver } from '@/utils/useIntersectionObserver'
import { HomeFlame } from './HomeFlame'
import { createPlaybackCoordinator } from './homePlayback'
import ui from './HomeTab.module.css'
import type { Accessor } from 'solid-js'
import type { HomeFlamePlacement } from './HomeFlame'
import type { PlaybackCoordinator } from './homePlayback'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { GalleryListItem, GallerySection } from '@/lib/galleryContent'
import type { TimelineTrack } from '@/utils/timeline'

/**
 * Home — Phase 2/3/4.
 *
 * Structure is the AABAAA combination chosen from the wireframes: left rail,
 * full-bleed hero with the statement over it, editorial-span gallery, a row of
 * motion tiles, capability cards, and the app framed as an exhibit.
 *
 * Every plate ships its captured poster and upgrades to a live GPU flame once it
 * settles into view, freezing back to the poster when it converges — see
 * HomeFlame.tsx for the gating, and `.agents/skills/gallery_preview_layout` for
 * why the mounting rules below are shaped the way they are. Three things live
 * here rather than in HomeFlame because they must be shared by every plate on
 * the page: the one IntersectionObserver (rooted on the scroll container, not
 * the viewport), the one ComputeGate that caps concurrent renders, and the one
 * PlaybackCoordinator that caps concurrently ANIMATING plates.
 */

/** Preload the rows just past the fold, so a plate is not blank on arrival. */
const PRELOAD_MARGIN = '300px'

/**
 * How many motion tiles greet you by playing themselves. The plan's whole point
 * for this section: "one or two auto-play briefly on arrival and then settle;
 * the rest animate on hover. The restraint matters: everything moving at once
 * reads as a screensaver, not a gallery."
 *
 * This is the number that ARE ASKED to; `MAX_CONCURRENT_PLAYBACK` in
 * homePlayback.ts is the hard cap that also covers hover, and is what actually
 * guarantees the page never exceeds it.
 */
const AUTO_PLAY_TILES = 2

/** Tracks one element's near-viewport state against Home's scroll container. */
type TrackVisibility = (
  target: Accessor<Element | null | undefined>,
) => Accessor<boolean>

export interface HomeTabProps {
  /**
   * Open a flame in the workspace (switches tab). `capability` is the row's
   * `gallery_items.capability` when the flame came from an Explore card, and
   * asks the workspace to open the matching tool as well as the flame — see
   * `openCapability` in MainWorkspace.tsx.
   */
  onOpenFlame: (
    flame: FlameDescriptor,
    tracks?: TimelineTrack[],
    capability?: string,
  ) => void
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
  placement: HomeFlamePlacement
  track: TrackVisibility
  onOpen: (slug: string) => void
  playback?: PlaybackCoordinator
  autoPlay?: boolean
}) {
  const [tileEl, setTileEl] = createSignal<HTMLElement>()
  const near = props.track(tileEl)
  const [hovered, setHovered] = createSignal(false)
  const [playing, setPlaying] = createSignal(false)
  return (
    <button
      ref={setTileEl}
      type="button"
      class={`${ui.plate} ${props.class ?? ''}`}
      /* Reflects HomeFlame's own playback state, so "how many plates are moving
         right now" is answerable from the DOM — by the reader, and by the
         Playwright run that has to prove the cap holds. */
      data-home-playing={playing() ? 'true' : undefined}
      onClick={() => {
        props.onOpen(props.item.slug)
      }}
      onPointerEnter={() => {
        setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
      }}
      title={`Open ${props.item.title} in the workspace`}
    >
      <HomeFlame
        slug={props.item.slug}
        poster={posterUrl(props.item)}
        placement={props.placement}
        near={near}
        hovered={hovered}
        posterOnly={needsPosterFrame(props.item)}
        playback={props.playback}
        autoPlay={props.autoPlay}
        onPlayingChange={setPlaying}
        freezeWhenConverged
      />
      <Show when={posterUrl(props.item) === undefined}>
        <span class={ui.plateEmpty}>No poster yet</span>
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

/**
 * A capability card. The plate lives directly in the thumb rather than in a
 * nested <button> — a button inside a button is invalid HTML and steals the
 * card's own click.
 */
function CapabilityCard(props: {
  item: GalleryListItem
  track: TrackVisibility
  onOpen: (slug: string) => void
  playback?: PlaybackCoordinator
}) {
  const [thumbEl, setThumbEl] = createSignal<HTMLElement>()
  const near = props.track(thumbEl)
  const [hovered, setHovered] = createSignal(false)
  const [playing, setPlaying] = createSignal(false)
  return (
    <button
      type="button"
      class={ui.card}
      data-home-playing={playing() ? 'true' : undefined}
      onClick={() => {
        props.onOpen(props.item.slug)
      }}
      onPointerEnter={() => {
        setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
      }}
    >
      <span class={ui.cardThumb} ref={setThumbEl}>
        <HomeFlame
          slug={props.item.slug}
          poster={posterUrl(props.item)}
          placement="thumb"
          near={near}
          hovered={hovered}
          posterOnly={needsPosterFrame(props.item)}
          playback={props.playback}
          onPlayingChange={setPlaying}
          freezeWhenConverged
        />
      </span>
      <span class={ui.cardTitle}>{props.item.title}</span>
      <Show when={props.item.caption}>
        {(caption) => <p class={ui.cardCaption}>{caption()}</p>}
      </Show>
    </button>
  )
}

/**
 * The hero: one live flame, large, above the fold, with the product statement
 * over it. It does NOT freeze — the whole point of the hero is that it is the
 * real renderer — but it is still visibility-gated, so scrolling several screens
 * past it releases its canvas rather than holding ~33 MiB of buffers for a page
 * nobody is looking at. Once converged Flam3 stops iterating on its own, so a
 * settled hero costs no ongoing GPU work.
 *
 * Deliberately given no PlaybackCoordinator: the hero is the one thing on the
 * page that is always live, and a large flame animating forever above the fold
 * is the screensaver the plan asks Home not to be. An animated hero row still
 * renders correctly — it rests at its poster frame like any other plate.
 */
function Hero(props: { item: GalleryListItem; track: TrackVisibility }) {
  const [heroEl, setHeroEl] = createSignal<HTMLElement>()
  const near = props.track(heroEl)
  return (
    <div class={ui.hero} ref={setHeroEl}>
      <HomeFlame
        slug={props.item.slug}
        poster={posterUrl(props.item)}
        placement="hero"
        near={near}
        posterOnly={needsPosterFrame(props.item)}
      />
      <div class={ui.heroCopy}>
        <div class={ui.heroText}>
          <h1 class={ui.heroTitle}>
            Fractal flames, rendered live in your browser
          </h1>
          <p class={ui.heroLede}>
            Everything below is a real flame, not a picture of one. Open any of
            them and it becomes yours to edit.
          </p>
        </div>
      </div>
    </div>
  )
}

export function HomeTab(props: HomeTabProps) {
  // Wrapped rather than passed directly: createResource hands the fetcher its
  // source value, which would arrive as the section filter.
  const [content] = createResource(() => fetchGallery())
  const sections = () => bySection(content() ?? [])

  // ONE observer for every plate on the page, rooted on Home's scroll container.
  // A viewport root cannot preload rows past the fold, because the inner scroll
  // clips them before the viewport does — so `rootMargin` would do nothing.
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement>()
  const track: TrackVisibility = createSharedIntersectionObserver(scrollEl, {
    rootMargin: PRELOAD_MARGIN,
  })

  // ONE playback budget for the whole page, for the same reason there is one
  // ComputeGate: the cap has to hold across sections, so a hovered gallery
  // plate and an auto-playing motion tile compete for the same slots.
  const playback = createPlaybackCoordinator()

  function scrollTo(id: string) {
    document.getElementById(`home-${id}`)?.scrollIntoView({ block: 'start' })
  }

  /**
   * Fetch the descriptor on demand — the list deliberately omits it. The row's
   * `capability` travels with it so a card can open the tool it advertises, not
   * just the flame that demonstrates it; a plain gallery plate has none.
   */
  async function open(slug: string) {
    try {
      const item = await fetchGalleryItem(slug)
      props.onOpenFlame(
        item.flame,
        item.animation?.tracks,
        item.capability ?? undefined,
      )
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
          onClick={() => {
            setActiveTab('workspace')
          }}
        >
          Back to the editor
        </button>
      </nav>

      <div class={ui.scroll} ref={setScrollEl}>
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
            {/* One gate for the whole page: at most COMPUTE_GATE_CAPACITY flames
                render at a time, however many plates happen to be mounted. */}
            <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
              {/* Hero — option A */}
              <section class={ui.section} id="home-hero">
                <For each={sections().hero}>
                  {(item) => <Hero item={item} track={track} />}
                </For>
              </section>

              {/* The flames — option B, editorial spans */}
              <section class={ui.section} id="home-gallery">
                <div class={ui.sectionHead}>
                  <h2 class={ui.sectionTitle}>The flames</h2>
                </div>
                <p class={ui.sectionNote}>
                  A curated wall. Each plate opens in the workspace exactly as
                  it is here.
                </p>
                <div class={ui.galleryGrid}>
                  <For each={sections().gallery}>
                    {(item, i) => (
                      <Plate
                        item={item}
                        class={SPANS[i() % SPANS.length]}
                        placement="plate"
                        track={track}
                        onOpen={open}
                        playback={playback}
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
                  Animated pieces. The first couple play once as you arrive;
                  point at any of them to see it move. Each carries its own
                  timeline, so opening one brings the animation with it.
                </p>
                <div class={ui.motionRow}>
                  <For each={sections().motion}>
                    {(item, i) => (
                      <div style={{ height: '12rem' }}>
                        <Plate
                          item={item}
                          placement="plate"
                          track={track}
                          onOpen={open}
                          playback={playback}
                          autoPlay={i() < AUTO_PLAY_TILES}
                        />
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
                  Each card opens a flame chosen to show off one part of the app
                  — with that part already open and pointed at it.
                </p>
                <div class={ui.cardGrid}>
                  <For each={sections().capability}>
                    {(item) => (
                      <CapabilityCard
                        item={item}
                        track={track}
                        onOpen={open}
                        playback={playback}
                      />
                    )}
                  </For>
                </div>
              </section>

              <footer class={ui.footer}>
                <a href="https://about.lumenapeiron.com/">About</a>
                <a href="/discord">Discord</a>
                <a href="https://github.com/chaos-matters/chaos-master">
                  Source
                </a>
              </footer>
            </ComputeGate>
          </Show>
        </Show>
      </div>
    </div>
  )
}
