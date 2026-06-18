# Spline (Catmull-Rom) keyframe interpolation + visual curve editor

Smooth parameter animation for the timeline: (a) **spline interpolation** so a run
of keyframes flows smoothly instead of the current per-segment easing, and (b) a
**visual curve editor** (value-vs-frame graph) to edit keyframes and pick
per-keyframe interpolation — the feel of IFSRenderer's animation panel.

Status: **Phase 1 implemented**; Phases 2–3 planned.

---

## 1. Background — how the references actually work (verified from source)

**IFSRenderer** (bezo97, C#/.NET — `IFSEngine/Animation/`, `WpfDisplay/Views/Animation/`):

- `Channel` ≙ our `TimelineTrack`. `Keyframe { double t; double Value;
  InterpolationMode; double EasingPower=1; EasingDirection }`.
- `InterpolationMode = { Linear, Constant, CatmullRom }`. The "spline" is
  **Catmull-Rom with auto-computed tangents** — the manual
  `LeftTangent/RightTangent` fields are present but **commented out**: they ship
  auto-tangents, no handle dragging. Strong signal for our default.
- `Channel.EvaluateAt(t)` keeps **easing orthogonal to interpolation** and
  composes them: sort by `t`, clamp outside range, find prev/next, normalize to
  `tNorm`, apply power easing → `tEasing`, then interpolate with `tEasing`:
  - Linear → `lerp(prev, next, tEasing)`
  - Constant → `prev`
  - CatmullRom → `p0` = keyframe before prev (clamp to prev), `p3` = keyframe
    after next (clamp to next), `CatmullRom(p0, p1, p2, p3, tEasing)`.
- Exact Catmull-Rom (cubic Hermite basis), directly portable to TS:
  ```
  h1 = 2t³−3t²+1 ; h2 = −2t³+3t² ; h3 = t³−2t²+t ; h4 = t³−t²
  m1 = (p2−p0)/2 ; m2 = (p3−p1)/2
  value = h1·p1 + h2·p2 + h3·m1 + h4·m2
  ```
- Also has audio-reactive channels (`AudioChannelDriver` + `Spectrogram`) → Phase 3 idea.

**JWildfire** (`/home/maff/foss/JWildfire/src/org/jwildfire/envelope/`):

- `Envelope { int x[]; double y[]; Interpolation {SPLINE, BEZIER, LINEAR};
  EditMode {DRAG_POINTS, DRAG_CURVE_HORIZ/VERT, SCALE_CURVE_HORIZ/VERT} }`.
- `SplineInterpolation` = Catmull-Rom too (tension B=0.5, endpoints clamped). Adds
  `BezierInterpolation` (manual handles) as a separate mode.
- `EnvelopeView` shows the graph's screen↔(time,value) transform to reuse:
  `xScale = width/(viewXMax−viewXMin)`, `yScale = height/(viewYMin−viewYMax)`,
  plus translations — i.e. value auto-ranged to the view box.

**Convergence:** both default to **Catmull-Rom auto-tangent**, easing kept
separate. Bezier-with-handles is JWildfire-only and optional. That is our plan:
Catmull-Rom now, Bezier + audio later.

---

## 2. Current state and the gap

- `KeyframeData { frame; value; easing? }`, `easing ∈
  linear|easeIn|easeOut|easeInOut|bounce|elastic` (`flame/schema/timeline.ts`,
  `utils/easing.ts`).
- `resolveKeyframeValue` (`utils/timeline.ts`): brackets prev/next, `t`, then
  `applyEasing(t, next.easing)` and **lerp**. C0 only — velocity is discontinuous
  at keyframes, so multi-keyframe motion looks "segmented".
- **Single choke point:** every consumer routes through `resolveKeyframeValue` —
  live playback (`applyTracksToFlame`), the loop synthesis (`resolveLoopValue`
  seamless/cycle), `resolveValueAtPath`, and all export paths. Adding spline there
  lights up everywhere for free.
- No visual curve — only dope-sheet diamonds + an easing dropdown
  (`KeyframeInspector`).

---

## 3. Design decisions

1. **Catmull-Rom auto-tangent** is the smooth mode (no manual handles) — matches
   both references' shipped default; minimal data, great results. Bezier handles
   are deferred to Phase 3.
2. **Interp orthogonal to easing.** Keep `easing` (named curve, reshapes `t`); add
   a separate `interp` mode. They compose: `easedT = applyEasing(t, easing)` is
   fed as the spline parameter (exactly IFSRenderer).
3. **Per-keyframe interp, owned by the *next* keyframe of a segment** — the same
   keyframe that already owns the segment's `easing` in our resolver. So a
   keyframe's `interp`/`easing` describe its **incoming** segment. Keeping one
   rule avoids changing existing easing semantics. (Inspector wording: "this
   keyframe's interpolation".)
4. **Default `interp = 'linear'`** → existing animations resolve byte-identically
   (full back-compat). Users opt into `spline` per keyframe. A future "default
   interpolation" setting / bulk-apply can flip whole tracks (Phase 2).
5. **Modes:** `'linear' | 'constant' | 'spline'`. `constant` = stepped/hold
   (useful for discrete params); `spline` = Catmull-Rom.
6. **Math helper lives in `utils/easing.ts`** beside `lerp`/`applyEasing`/`clamp`,
   pure and unit-tested.

---

## 4. Data model

`flame/schema/timeline.ts` (valibot — persisted, shared/exported):
```ts
export const KeyframeInterpolation = v.picklist(['linear', 'constant', 'spline'])
export type KeyframeInterpolation = v.InferOutput<typeof KeyframeInterpolation>

export const Keyframe = v.object({
  frame: v.number(),
  value: KeyframeValue,
  easing: v.optional(EasingCurve, 'linear'),
  interp: v.optional(KeyframeInterpolation, 'linear'), // NEW, defaulted → back-compat
})
```
`utils/timeline.ts` (runtime literal types, kept in sync like `EasingCurve`):
```ts
export type KeyframeInterpolation = 'linear' | 'constant' | 'spline'
export type KeyframeData = { frame; value; easing?: EasingCurve; interp?: KeyframeInterpolation }
```
Optional + defaulted so old saved/shared/embedded animations validate unchanged
(mind the valibot `InferOutput` widening — fix at call sites, trust CI).

---

## 5. Interpolation algorithm (exact)

`utils/easing.ts`:
```ts
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t
  const h1 = 2*t3 - 3*t2 + 1, h2 = -2*t3 + 3*t2, h3 = t3 - 2*t2 + t, h4 = t3 - t2
  const m1 = (p2 - p0) / 2, m2 = (p3 - p1) / 2
  return h1*p1 + h2*p2 + h3*m1 + h4*m2
}
```
`resolveKeyframeValue` — after computing the bracket `[prev, next]` (capture
`prevIdx`), `t`, `easedT = applyEasing(t, next.easing)`, and `interp = next.interp`:
- numbers: `constant → prev`; `spline → catmullRom(v0, prev, next, v3, easedT)`
  where `v0 = sorted[prevIdx-1]?.value` (clamp to `prev`), `v3 =
  sorted[prevIdx+2]?.value` (clamp to `next`); else lerp.
- arrays (colours): same, component-wise.
- strings/booleans: hold (unchanged; spline N/A).

Notes: endpoint clamping (duplicate the boundary key) matches both refs; a
2-keyframe spline therefore yields a gentle auto-eased S (passes through both
keys, midpoint == linear midpoint) — **not** identical to linear. `interp:
'linear'` is byte-identical to today.

---

## 6. Phase 1 — Core interpolation  *(implemented)*

Files:
- `utils/easing.ts` — `catmullRom`.
- `flame/schema/timeline.ts` — `KeyframeInterpolation` + `interp` field.
- `utils/timeline.ts` — `KeyframeData.interp`, `KeyframeInterpolation`,
  `resolveKeyframeValue` spline/constant branch, `setKeyframeInterp(path, frame,
  interp)`, and **interp preservation** through `addKeyframeImpl` (update branch),
  `moveKeyframe`, `splitKeyframeAtFrame`, mirror ops, `loadTracks`.
- `utils/timeline.test.ts` — unit tests (below).

Acceptance: typecheck + lint + full test suite green; existing animations
unchanged; spline visibly smooth on a 3+ keyframe track; composes with loop
modes + export (shared resolver).

---

## 7. Phase 2 — Visual curve editor  *(next)*

New `components/Timeline/CurveEditor/`:
- `CurveEditor.tsx` — SVG graph. X = frame (share the dope-sheet ruler's
  zoom/scroll/`frameWidth`), Y = value auto-ranged per visible track
  (EnvelopeView-style scale/translate, with padding). Render each selected
  track's curve as an SVG `<path>` sampled from `resolveKeyframeValue` (e.g. every
  1–2 px), plus keyframe `<circle>` nodes and the playhead.
- Interactions (event-driven, per conventions — imperative handlers, **no**
  `createEffect` state-sync): drag node → `moveKeyframe` (X) + `setKeyframeValue`
  (Y) inside a `ChangeHistory` preview/commit (mirror `KeyframeInspector`'s scrub);
  click empty → add; right-click → context menu (delete, interp, easing); scroll =
  zoom, space-drag/middle-drag = pan; snap-to-frame; value/frame readout.
- `CurveEditor.module.css` — themed via `--neutral-*` / `--accent-color`, dark
  aesthetics; SVG icons from `src/icons` (no emojis).
- Integration: a graph⇄diamonds **view toggle** on the dope sheet header (SVG
  icon), driven by the selected track(s) from `KeyframeTargetContext`. Reuse
  existing `timeline` ops + undo stack — no new global state.
- `KeyframeInspector`: add an **Interp** `<select>` (linear/constant/spline)
  beside Ease, wired to `setKeyframeInterp` (event-driven). Optional per-track
  "apply interp to all" action.
- Tests: coordinate-mapping pure helpers (frame↔x, value↔y, auto-range) unit
  tested; component smoke test for node drag → keyframe update.

Component breakdown (modular, small, single-responsibility):
- `useCurveViewport()` hook — pure frame↔px / value↔px transforms + auto-range
  (testable, no DOM).
- `CurvePath` — renders one track's sampled `<path>` + nodes.
- `CurveEditor` — composes viewport + tracks + input handling.

---

## 8. Phase 3 — Extensions  *(later, planned now)*

1. **Bezier interpolation with manual tangent handles** (JWildfire
   `BezierInterpolation`): add `'bezier'` to `KeyframeInterpolation` and optional
   `inTangent`/`outTangent` (control-point offsets in (frame,value) space) on
   `Keyframe` (optional → back-compat). Resolver: per-segment cubic Bezier from
   the two keyframes + their adjacent handles. Curve editor draws draggable handle
   lines on the selected node; auto-init handles from the Catmull-Rom tangents so
   converting spline→bezier is seamless. Broken/aligned/mirrored handle modes.
2. **Audio-reactive channels** (IFSRenderer `AudioChannelDriver` + `Spectrogram`):
   optional per-track driver that modulates the resolved value from an audio
   feature (amplitude/FFT band) at the current time; a spectrogram strip under the
   timeline; `Web Audio` analyser. Larger, self-contained; gate behind the
   resolver post-step (`value = driver ? driver.apply(value, frame) : value`),
   exactly IFSRenderer's hook point.
3. **Curve-box edit modes** (JWildfire): drag/scale a whole selection of keyframes
   horizontally/vertically in the graph.

---

## 9. Testing strategy

- Phase 1 (unit, `utils/timeline.test.ts` + `easing`): `catmullRom` passes
  through `p1@t0`/`p2@t1`; collinear control points → linear midpoint;
  `resolveKeyframeValue` spline resolves endpoints exactly and stays within
  control-point bounds for monotonic data; `constant` holds; `interp:'linear'`
  equals prior lerp; **interp is preserved** across value-scrub and easing edits,
  `moveKeyframe`, split, mirror; spline composes with `resolveLoopValue`.
- Phase 2: viewport transform round-trips; node-drag updates the right keyframe.

---

## 10. Conventions / SolidJS adherence

- Event-driven imperative updates in handlers; **no** `createEffect` store-sync
  (avoids recursive reactivity). (project-conventions §1.1)
- Edits go through the existing `solid-js/store` + `structurajs` undo stack
  (`timeline.*` ops, `ChangeHistory` preview/commit for drags). (§1.2)
- `<Show keyed>` with a function child where remount is needed. (§1.3)
- SVG icons from `src/icons`, **no emojis**; themed `--neutral-*`/`--accent-color`
  CSS, dark aesthetics. (§3)
- Modular: pure math in `easing.ts`, pure viewport hook, small components,
  single-responsibility; the resolver stays the one source of truth.

---

## 11. Risks & back-compat

- Schema change is additive + defaulted → old animations load unchanged; verify a
  round-trip (save→load) test and the share/embedded-PNG path.
- valibot `InferOutput` widening can flip CI typecheck even when local is green —
  fix at call sites, treat CI as authority.
- Don't change the `next`-owns-segment rule for easing (would silently alter
  existing animations).
- Curve editor must reuse the dope-sheet's frame mapping so the two views stay
  pixel-aligned.
