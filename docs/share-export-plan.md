# Share Link + Animation Export & Bug Fixes — Implementation Plan

## Context

The Blender-style timeline (dope sheet, keyframe diamonds, auto-keyframe, I-key shortcuts) is already built and working. This plan covers:

1. **Bug fixes** for the inspector value not updating when clicking diamonds, timeline corruption when clicking during animation, and erratic diamond behavior
2. **Share Link** should include animation tracks when keyframes exist (currently only shares IFS flame descriptor)
3. **Export PNG dialog** with quality/resolution settings (currently a one-click export with no options)
4. **Animation URL loading** — shared animation should load from URL and play once
5. **Auto-fit zoom** for dope sheet when tracks change

## Phase 1: Bug Fixes

### Bug 1: `didDrag` persistency (DopeSheetTrack.tsx:37-85)

**Root cause**: `didDrag` is set to `false` only in `handleDragStart` (line 48). After a drag completes, it stays `true` forever. The `onClick` handler (line 132) checks `if (!didDrag)` — so after any drag on a track, subsequent diamond clicks silently fail to call `onSelectKeyframe`, and the inspector never updates.

**Fix**: Reset `didDrag = false` in `handleUp` after processing the drag.

### Bug 2: `addKeyframeImpl` mutates keyframe objects in-place (timeline.ts:430-435)

**Root cause**: When a keyframe exists at a frame, `existingKf.value = value` mutates the object rather than replacing it. The outer array `[...prev]` is a new reference, but the inner keyframe object is the SAME reference. The `selectedKeyframeData` memo calls `timeline.getKeyframeAtFrame()` which returns this same object. Since the object identity didn't change, SolidJS memo tracking may not re-evaluate for nested property reads.

**Fix**: In `addKeyframeImpl`, replace the keyframe object instead of mutating it:
```typescript
existingTrack.keyframes = existingTrack.keyframes.map((kf) =>
  kf.frame === frame ? { frame, value, easing: easing ?? kf.easing } : kf
)
```

### Bug 3: `handleLaneClick` adds keyframes with stale flame descriptor values (DopeSheetTrack.tsx:88-100)

**Root cause**: `handleLaneClick` calls `timeline.addKeyframeAtCurrentFrame(path)` which uses `valueResolverFn` (i.e., `getFlameValue` from App.tsx) to read the value. `getFlameValue` reads from the raw `flameDescriptor` store, NOT the animation-applied values. During animation playback, the visible/interpolated value differs from the base descriptor value, so clicking the lane creates a keyframe with the wrong value.

**Fix**: Don't auto-create keyframes on lane click — only seek. Keyframe insertion should be explicit (diamond click or I-key). Change `handleLaneClick` to only call `timeline.goToFrame(clampedFrame)`.

### Bug 4: Animation tracks corrupted when clicking diamonds during playback

**Root cause**: When animation is playing and user clicks a dope sheet diamond, `handleDragStart` fires on `onPointerDown`, which initiates pointer capture. Combined with Bug 1 and Bug 2, this can cause the timeline to enter inconsistent state where:
- A click registers as both a selection AND a drag start
- `moveKeyframe` calls `pushUndo()` + `removeKeyframeImpl` + `addKeyframeImpl`, causing two sequential `setTracks` calls
- During playback, `currentFrame` is advancing every frame while these mutations occur

**Fix**: Disable drag/click interactions on dope sheet diamonds while animation is playing. If `timeline.isPlaying()` is true, diamond clicks should only select (no drag, no lane click keyframe creation).

### Bug 5: Inspector value not reactive to animation playback

**Root cause**: The `selectedKeyframeData` memo reads `kf.value` from the same object reference (Bug 2), but also: when animation is playing and `currentFrame` changes, the selected keyframe's interpolated value should show the interpolated result, not the stored keyframe value. Currently the inspector shows the STORED keyframe value which is static.

This is actually by design for a dope sheet inspector — the inspector shows the stored keyframe value, not the live interpolated one. But Bug 1 + Bug 2 make it appear broken.

**Fix**: Covered by Bug 1 + Bug 2 fixes. The inspector correctly shows stored keyframe values; the issue was that clicking diamonds didn't update `selectedKeyframe`.

## Phase 2: Share Link with Animation Data

### Step 1: Fix and Use Timeline Valibot Schema (`flame/schema/timeline.ts`)

Add the missing `value` field to the `Keyframe` schema, and fix `TimelineData` type from `Record<string, TimelineTrack>` to `TimelineTrack[]`.

### Step 2: Create Shareable Payload Type

```typescript
interface SharePayload {
  flame: FlameDescriptor
  animation?: {
    tracks: TimelineTrack[]
    config: TimelineConfig
  }
}
```

### Step 3: Modify `encodeJsonQueryParam` / Create New Wrapper

Add `encodeSharePayload(flame, timeline?)` and `decodeSharePayload(param)` functions:
- `encodeSharePayload` — wraps flame + optional animation, compresses, encodes
- `decodeSharePayload` — decodes, decompresses, validates, returns `{ flame, animation? }`
- Only includes animation key if tracks array is non-empty (at least one keyframe exists)

### Step 4: Modify ShareLinkModal

- Pass `timeline` state to `createShareLinkModal`
- Add toggle: "Include Animation" (only enabled when `timeline.tracks().length > 0`)
- Add frame count / FPS display (read-only from `timeline.config()`)
- Animation data only packed when toggle is ON
- Both options produce a `?flame=` URL (same param name for backward compat)

### Step 5: Modify URL Loading in App.tsx

- `decodeSharePayload` returns `{ flame, animation? }` 
- When animation data is present, load it the same way `loadedAnimation` does: `timeline.setTracks()`, `timeline.setAnimationEnabled(true)`, `timeline.goToFrame(0)`, `timeline.play()` with `loop: false`
- Play once and stop (don't loop shared animations)

## Phase 3: Export PNG Dialog

### Step 1: Create ExportPngDialog Component

`components/ExportPngDialog/ExportPngDialog.tsx` + CSS module

**Settings:**
- **Resolution**: `1x`, `2x`, `4x` (renders at `canvas.width * scale`, `canvas.height * scale`)
- **Quality**: `0.5` to `1.0` slider (passed to `canvas.toBlob` as second arg)
- **Embed flame data**: checkbox (default on) — whether to embed flame JSON in PNG zTXt chunk
- **Embed animation**: checkbox (only if tracks exist) — whether to embed animation data alongside flame

### Step 2: Wire Export Dialog

- Replace direct `setOnExportImage(() => exportCanvasImage)` call with opening the dialog
- Dialog calls `setOnExportImage` with a custom function that renders at the chosen resolution/quality

### Step 3: Cancel Support

- Dialog has "Cancel" button that closes without exporting
- "Export" button triggers the actual export

## Phase 4: DopeSheet Auto-Fit

### Step 1: Auto-fit on Track Changes

- If `timeline.tracks()` was empty and becomes non-empty → auto-fit
- If a NEW track appears (track with previously unseen `parameterPath`) → auto-fit
- If user manually adjusted zoom → don't auto-fit

## Phase 5: Timeline Play-Once for Shared Animations

- When loading from shared URL, set `timeline.setConfig({ ...config, loop: false })`
- When animation reaches `endFrame` and `loop === false`, call `timeline.pause()` / `setIsPlaying(false)`

## Files to Modify

| File | Changes |
|------|---------|
| `components/Timeline/DopeSheetTrack.tsx` | Bug 1: reset `didDrag` in handleUp. Bug 3: remove `addKeyframeAtCurrentFrame` from lane click. Bug 4: disable drag during playback. |
| `utils/timeline.ts` | Bug 2: replace-instead-of-mutate in `addKeyframeImpl`. Phase 5: pause at end when `loop === false`. |
| `flame/schema/timeline.ts` | Add missing `value` field to Keyframe schema |
| `utils/jsonQueryParam.ts` | Add `encodeSharePayload` / `decodeSharePayload` |
| `components/ShareLinkModal/ShareLinkModal.tsx` | Add "Include Animation" toggle, frame info display |
| `App.tsx` | Wire share payload to include timeline; modify URL loading to handle animation data; wire ExportPngDialog |
| `components/Timeline/DopeSheet.tsx` | Auto-fit on new tracks (Phase 4) |

## Files to Create

| File | Purpose |
|------|---------|
| `components/ExportPngDialog/ExportPngDialog.tsx` | Export settings dialog |
| `components/ExportPngDialog/ExportPngDialog.module.css` | Dialog styles |
