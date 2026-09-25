/**
 * The clash page around its stage: what it shows while the fighters load,
 * inside the fallback-less Suspense that StandalonePage wraps every page in;
 * the editor's custom variations, loaded before any fighter; and the picker,
 * which keeps the fighter it was opened with whatever source it comes from.
 */
import { cleanup, fireEvent, render, screen, waitFor, } from '@solidjs/testing-library'
import { Suspense } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { ClashPage } from './ClashPage'
import type * as ClashFighters from './clashFighters'
import type { FighterRef, LoadedFighter } from './clashFighters'
import type { GalleryListItem } from '@/lib/galleryContent'

const mocks = vi.hoisted(() => ({
  loadFighter: vi.fn(),
  fetchGallery: vi.fn(),
  loadCustomVariations: vi.fn(),
  order: [] as string[],
}))

vi.mock('./clashFighters', async (importOriginal) => ({
  ...(await importOriginal<typeof ClashFighters>()),
  loadFighter: mocks.loadFighter,
}))
vi.mock('@/lib/galleryContent', () => ({ fetchGallery: mocks.fetchGallery }))
vi.mock('@/flame/variations/custom', () => ({
  loadCustomVariations: mocks.loadCustomVariations,
}))
vi.mock('@/components/ClashStage/ClashStage', () => ({
  ClashStage: (props: {
    a: { name: string }
    b: { name: string }
    onChangeFighters?: () => void
  }) => (
    <div data-testid="stage">
      {props.a.name} vs {props.b.name}
      <button type="button" onClick={() => props.onChangeFighters?.()}>
        Change fighters
      </button>
    </div>
  ),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** A fighter for any ref: example37's flame, named after the ref. */
const fighterFor = (ref: FighterRef): LoadedFighter => ({
  flame: examples.example37,
  name: `${ref.source} ${ref.id}`,
})

const galleryItem = (slug: string, title: string): GalleryListItem =>
  ({ slug, title, caption: null, author: null }) as GalleryListItem

function renderPage(search: string) {
  window.history.replaceState(null, '', `/clash${search}`)
  // As StandalonePage.tsx wraps a page: a Suspense with no fallback.
  return render(() => (
    <Suspense>
      <ClashPage />
    </Suspense>
  ))
}

beforeEach(() => {
  mocks.order.length = 0
  mocks.loadCustomVariations.mockImplementation(() => {
    mocks.order.push('custom variations')
  })
  mocks.loadFighter.mockImplementation((ref: FighterRef) => {
    mocks.order.push(`fighter ${ref.id}`)
    return Promise.resolve(fighterFor(ref))
  })
  mocks.fetchGallery.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ClashPage', () => {
  it('says it is loading the fighters while they load', async () => {
    const pending = deferred<LoadedFighter>()
    mocks.loadFighter.mockReturnValue(pending.promise)
    renderPage('')
    expect(await screen.findByText('Loading the fighters...')).toBeTruthy()
    pending.resolve(fighterFor({ source: 'example', id: 'example37' }))
    expect(await screen.findByTestId('stage')).toBeTruthy()
    expect(screen.queryByText('Loading the fighters...')).toBeNull()
  })

  it('keeps the bout on screen while the picker fetches the gallery', async () => {
    mocks.fetchGallery.mockReturnValue(deferred<GalleryListItem[]>().promise)
    renderPage('')
    fireEvent.click(await screen.findByText('Change fighters'))
    expect(screen.getByTestId('stage')).toBeTruthy()
    expect(
      screen.getByRole('form', { name: 'Choose the fighters' }),
    ).toBeTruthy()
  })

  it('loads the editor’s custom variations before any fighter', async () => {
    renderPage('')
    await screen.findByTestId('stage')
    expect(mocks.order[0]).toBe('custom variations')
    expect(mocks.order).toContain('fighter example37')
  })

  it('keeps a gallery fighter chosen once the gallery arrives, and fights it', async () => {
    const gallery = deferred<GalleryListItem[]>()
    mocks.fetchGallery.mockReturnValue(gallery.promise)
    renderPage('?a=gallery:spiral-2&b=example:example2')
    fireEvent.click(await screen.findByText('Change fighters'))
    const [pickA] = screen.getAllByRole<HTMLSelectElement>('combobox')
    gallery.resolve([
      galleryItem('ember-1', 'Ember'),
      galleryItem('spiral-2', 'Spiral Two'),
    ])
    await screen.findAllByRole('option', { name: 'Spiral Two' })
    expect(pickA!.value).toBe('gallery:spiral-2')
    fireEvent.click(screen.getByRole('button', { name: 'Fight' }))
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get('a')).toBe(
        'gallery:spiral-2',
      )
    })
  })

  it('fights the fighters picked, whatever was chosen before', async () => {
    renderPage('')
    fireEvent.click(await screen.findByText('Change fighters'))
    const [pickA, pickB] = screen.getAllByRole<HTMLSelectElement>('combobox')
    fireEvent.change(pickA!, { target: { value: 'example:example2' } })
    fireEvent.change(pickB!, { target: { value: 'example:example13' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fight' }))
    await waitFor(() => {
      expect(mocks.order).toEqual(
        expect.arrayContaining(['fighter example2', 'fighter example13']),
      )
    })
    const params = new URL(window.location.href).searchParams
    expect([params.get('a'), params.get('b')]).toEqual([
      'example:example2',
      'example:example13',
    ])
  })
})
