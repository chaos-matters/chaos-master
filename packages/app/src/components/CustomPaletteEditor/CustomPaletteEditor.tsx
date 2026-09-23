/**
 * Interactive custom palette editor.
 *
 * Features:
 * - Gradient bar with draggable color stops
 * - Click gradient to add new stops
 * - Drag stops to reposition, with a mouse, a pen or a finger
 * - Click stop to edit color via OkLab a/b plane picker
 * - Delete individual stops
 * - Palette name editing
 * - Save / Cancel / Delete palette
 */

import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { addCustomPalette, deleteCustomPalette, paletteEntry, updateCustomPalette, } from '@/flame/colorMap'
import { oklabToRgbForCss } from '@/flame/colors'
import { createDragHandler } from '@/utils/createDragHandler'
import { clamp } from '@/utils/easing'
import ui from './CustomPaletteEditor.module.css'
import type { Palette, PaletteEntry } from '@/flame/colorMap'

type CustomPaletteEditorProps = {
  /** Existing custom palette to edit, or undefined to create a new one */
  initialPalette?: Palette
  onSave: (palette: Palette) => void
  onCancel: () => void
  onDelete?: () => void
}

const MIN_STOPS = 2

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function CustomPaletteEditor(props: CustomPaletteEditorProps) {
  const isEditing = () => props.initialPalette !== undefined

  const [name, setName] = createSignal(
    props.initialPalette?.name ?? 'My Palette',
  )
  const [entries, setEntries] = createSignal<PaletteEntry[]>(
    props.initialPalette
      ? [...props.initialPalette.entries].sort(
          (a, b) => a.position - b.position,
        )
      : [paletteEntry(0, -0.2, -0.2), paletteEntry(1, 0.2, 0.2)],
  )

  // The stop being edited, by id: dragging a stop past a neighbour re-sorts
  // them, and an index would then name the neighbour.
  const [activeStopId, setActiveStopId] = createSignal<string | null>(null)
  const [editingColor, setEditingColor] = createSignal(false)

  // Color being edited in the a/b picker
  const [editA, setEditA] = createSignal(0)
  const [editB, setEditB] = createSignal(0)

  let gradientBarRef: HTMLDivElement | undefined
  let pickerRef: HTMLDivElement | undefined

  const sortedEntries = createMemo(() =>
    [...entries()].sort((a, b) => a.position - b.position),
  )

  const gradientCSS = createMemo(() => {
    const stops = sortedEntries().map(
      (entry) =>
        `${oklabToRgbForCss(entry.a, entry.b, 0.7)} ${Math.round(entry.position * 100)}%`,
    )
    return `linear-gradient(to right, ${stops.join(', ')})`
  })

  const activeStopIndex = () =>
    sortedEntries().findIndex((entry) => entry.id === activeStopId())

  const activeEntry = createMemo(
    () => sortedEntries().find((entry) => entry.id === activeStopId()) ?? null,
  )

  function selectStop(entry: PaletteEntry) {
    setActiveStopId(entry.id)
    setEditA(entry.a)
    setEditB(entry.b)
    setEditingColor(false)
  }

  function handleGradientClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains(ui.stopHandle || ''))
      return
    if (!gradientBarRef) return

    const rect = gradientBarRef.getBoundingClientRect()
    const pos = clamp((e.clientX - rect.left) / rect.width, 0, 1)

    // Insert at a position between closest entries. Clicking before the
    // first stop or after the last falls outside every [i, i+1] window
    // below, so seed a/b from the nearest endpoint's color instead of
    // leaving them at a default of (0, 0).
    const sorted = sortedEntries()
    let a = sorted[0]?.a ?? 0
    let b = sorted[0]?.b ?? 0
    const lastEntry = sorted[sorted.length - 1]
    if (lastEntry && pos >= lastEntry.position) {
      a = lastEntry.a
      b = lastEntry.b
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      if (pos >= sorted[i]!.position && pos <= sorted[i + 1]!.position) {
        // Interpolate
        const t =
          (pos - sorted[i]!.position) /
          (sorted[i + 1]!.position - sorted[i]!.position)
        a = sorted[i]!.a + (sorted[i + 1]!.a - sorted[i]!.a) * t
        b = sorted[i]!.b + (sorted[i + 1]!.b - sorted[i]!.b) * t
        break
      }
    }

    const newEntry: PaletteEntry = {
      id: generateId(),
      position: pos,
      a,
      b,
    }

    setEntries([...entries(), newEntry])
    setActiveStopId(newEntry.id)
    setEditA(a)
    setEditB(b)
    setEditingColor(true)
  }

  // Pointer events, so a finger drags a stop on a tablet as a mouse does;
  // touch-action on the handle keeps the browser from scrolling instead. The
  // dead zone keeps a tap from nudging the stop it selects.
  const startStopDrag = createDragHandler(
    (event) => {
      const id =
        event.target instanceof HTMLElement
          ? event.target.dataset.stopId
          : undefined
      const bar = gradientBarRef
      if (id === undefined || !bar) return undefined
      return {
        onPointerMove(move) {
          const rect = bar.getBoundingClientRect()
          const position = clamp((move.clientX - rect.left) / rect.width, 0, 1)
          setEntries((prev) =>
            prev.map((entry) =>
              entry.id === id ? { ...entry, position } : entry,
            ),
          )
        },
      }
    },
    { deadZoneRadius: 4 },
  )

  /** Put the a/b point under the pointer, kept inside the plane. */
  function pickAt(e: PointerEvent) {
    if (!pickerRef) return
    const rect = pickerRef.getBoundingClientRect()
    // x: -1 to 1 (a channel), y: -1 to 1 (b channel)
    setEditA(clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1))
    setEditB(clamp((1 - (e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1))
  }

  // The point jumps to where the plane is pressed and follows the pointer,
  // mouse, pen or finger, until it is let go.
  const startPick = createDragHandler((event) => {
    pickAt(event)
    return { onPointerMove: pickAt }
  })

  function applyColorToStop() {
    const id = activeStopId()
    if (id === null) return
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, a: editA(), b: editB() } : e)),
    )
  }

  function handleDeleteStop(e: MouseEvent) {
    e.stopPropagation()
    const id = activeStopId()
    if (entries().length <= MIN_STOPS || id === null) return

    setEntries((prev) => prev.filter((entry) => entry.id !== id))
    setActiveStopId(null)
    setEditingColor(false)
  }

  function handleSave() {
    const sorted = sortedEntries()
    if (sorted.length < MIN_STOPS) return

    const paletteData = {
      name: name(),
      entries: sorted,
      source: 'custom' as const,
    }

    if (isEditing() && props.initialPalette) {
      const updated = updateCustomPalette(props.initialPalette.id, paletteData)
      if (updated) props.onSave(updated)
    } else {
      const created = addCustomPalette(paletteData)
      props.onSave(created)
    }
  }

  function handleDelete() {
    if (props.initialPalette) {
      deleteCustomPalette(props.initialPalette.id)
    }
    props.onDelete?.()
  }

  // Sync active stop position to edit values when selection changes
  createEffect(() => {
    const entry = activeEntry()
    if (entry && !editingColor()) {
      setEditA(entry.a)
      setEditB(entry.b)
    }
  })

  return (
    <div class={ui.editor}>
      {/* Palette name */}
      <div class={ui.nameRow}>
        <input
          class={ui.nameInput}
          type="text"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          placeholder="Palette name"
          maxLength={40}
        />
      </div>

      {/* Gradient bar with stops */}
      <div
        ref={gradientBarRef}
        class={ui.gradientBar}
        style={{ background: gradientCSS() }}
        onClick={handleGradientClick}
      >
        <For each={sortedEntries()}>
          {(entry) => (
            <div
              class={ui.stopHandle}
              classList={{
                [ui.stopActive as string]: activeStopId() === entry.id,
              }}
              data-stop-id={entry.id}
              style={{
                left: `${Math.round(entry.position * 100)}%`,
                background: oklabToRgbForCss(entry.a, entry.b, 0.7),
              }}
              onPointerDown={(e) => {
                selectStop(entry)
                startStopDrag(e)
              }}
              onClick={(e) => {
                e.stopPropagation()
                selectStop(entry)
              }}
            />
          )}
        </For>
      </div>

      {/* Stop info and controls */}
      <Show when={activeEntry()}>
        <div class={ui.stopInfo}>
          <span class={ui.stopLabel}>
            Stop {activeStopIndex() + 1} / {sortedEntries().length}
          </span>
          <div class={ui.stopValues}>
            <span>a: {editA().toFixed(2)}</span>
            <span>b: {editB().toFixed(2)}</span>
          </div>
          <button
            class={ui.editColorBtn}
            onClick={() => setEditingColor(!editingColor())}
          >
            {editingColor() ? 'Hide Color Picker' : 'Edit Color'}
          </button>
          <button
            class={ui.deleteStopBtn}
            onClick={handleDeleteStop}
            disabled={entries().length <= MIN_STOPS}
            title={
              entries().length <= MIN_STOPS
                ? 'Need at least 2 stops'
                : 'Delete this stop'
            }
          >
            Delete Stop
          </button>
        </div>

        {/* Color picker */}
        <Show when={editingColor()}>
          <div class={ui.colorPickerSection}>
            {/* Color preview */}
            <div
              class={ui.colorPreview}
              style={{ background: oklabToRgbForCss(editA(), editB(), 0.7) }}
            />

            {/* a/b plane picker */}
            <div
              ref={pickerRef}
              class={ui.oklabPicker}
              onPointerDown={startPick}
            >
              {/* Grid overlay */}
              <div class={ui.pickerGrid} />
              {/* Crosshair */}
              <div
                class={ui.crosshair}
                style={{
                  left: `${((editA() + 1) / 2) * 100}%`,
                  top: `${((1 - editB()) / 2) * 100}%`,
                }}
              />
            </div>

            {/* Sliders for fine control */}
            <div class={ui.sliderRow}>
              <label class={ui.sliderLabel}>
                a (green&#8592;&#8594;red)
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={editA()}
                  onInput={(e) => setEditA(parseFloat(e.currentTarget.value))}
                  class={ui.slider}
                />
              </label>
            </div>
            <div class={ui.sliderRow}>
              <label class={ui.sliderLabel}>
                b (blue&#8592;&#8594;yellow)
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={editB()}
                  onInput={(e) => setEditB(parseFloat(e.currentTarget.value))}
                  class={ui.slider}
                />
              </label>
            </div>

            {/* Preset colors */}
            <div class={ui.presetRow}>
              <For each={PRESET_COLORS}>
                {(preset) => (
                  <button
                    class={ui.presetBtn}
                    style={{
                      background: oklabToRgbForCss(preset.a, preset.b, 0.7),
                    }}
                    title={preset.name}
                    onClick={() => {
                      setEditA(preset.a)
                      setEditB(preset.b)
                    }}
                  />
                )}
              </For>
            </div>

            <button class={ui.applyBtn} onClick={applyColorToStop}>
              Apply Color
            </button>
          </div>
        </Show>
      </Show>

      {/* Preview gradient */}
      <div class={ui.previewSection}>
        <span class={ui.previewLabel}>Preview</span>
        <div class={ui.previewGradient} style={{ background: gradientCSS() }} />
      </div>

      {/* Action buttons */}
      <div class={ui.actions}>
        <button class={ui.cancelBtn} onClick={props.onCancel}>
          Cancel
        </button>
        <Show when={isEditing()}>
          <button class={ui.deleteBtn} onClick={handleDelete}>
            Delete Palette
          </button>
        </Show>
        <button class={ui.saveBtn} onClick={handleSave}>
          {isEditing() ? 'Save Changes' : 'Save Palette'}
        </button>
      </div>
    </div>
  )
}

/** Preset color stops for quick palette creation */
const PRESET_COLORS = [
  { name: 'Red', a: 0.5, b: 0.4 },
  { name: 'Orange', a: 0.4, b: 0.6 },
  { name: 'Yellow', a: 0.2, b: 0.7 },
  { name: 'Green', a: -0.2, b: 0.5 },
  { name: 'Cyan', a: -0.3, b: -0.2 },
  { name: 'Blue', a: -0.3, b: -0.6 },
  { name: 'Purple', a: 0.3, b: -0.5 },
  { name: 'Pink', a: 0.5, b: 0.2 },
  { name: 'White', a: 0, b: 0 },
  { name: 'Black', a: -0.1, b: -0.1 },
]
