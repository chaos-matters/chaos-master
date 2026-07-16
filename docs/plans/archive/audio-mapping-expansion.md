# Audio Mapping Expansion — Transform/Color/Variation Targets

## Problem

Audio mappings currently target only 11 flat parameters under `flame.renderSettings`:
`vibrancy`, `exposure`, `palettePhase`, `paletteSpeed`, `contrast`, `gamma`,
`highlightPower`, `lightPower`, `depthColorPower`, `zoom`, `skipIters`.

The user wants to map audio to **anything** in the flame: affine coefficients,
variation weights, transform colors/probability, final transform, etc.

## Architecture

### Current chain

```
AudioReactivePanel              useAudioReactive            applyAudioMappingsToFlame
  └─ ParamMapping[]               └─ interval (30fps)         └─ reads frameData
     ├─ audioFeature                 ├─ frameData                └─ writes flame.renderSettings
     ├─ flameParam (flat string)     └─ setFlameDescriptor(      └─ camera.zoom (special case)
     ├─ sensitivity                     draft =>
     ├─ range                              applyAudio(...)
     └─ attackMs/releaseMs              )
```

### Target model

Replace the flat `FlameParam` string union with a **discriminated union** that
encodes the exact path into the flame descriptor:

```typescript
type AffineKey = 'a' | 'b' | 'c' | 'd' | 'e' | 'f'

type FlameTarget =
  // Render settings (no transform context needed)
  | { kind: 'renderSetting'; param: RenderSettingKey }

  // Transform-level: affine coefficients
  | {
      kind: 'transformAffine'
      transformIdx: number
      matrix: 'preAffine' | 'postAffine'
      param: AffineKey
    }

  // Transform-level: scalar properties
  | {
      kind: 'transformProperty'
      transformIdx: number
      property: 'probability' | 'colorX' | 'colorY' | 'colorSpeed'
    }

  // Variation weight (per-transform, per-variation)
  | { kind: 'variationWeight'; transformIdx: number; variationType: string }

  // Final transform affine
  | { kind: 'finalAffine'; param: AffineKey }
```

### Data flow changes

```
AudioReactivePanel              useAudioReactive            applyAudioMappingsToFlame
  └─ ParamMapping[]               └─ interval                  └─ reads frameData
     ├─ audioFeature                 ├─ frameData                └─ resolves FlameTarget
     ├─ target: FlameTarget (NEW)    └─ setFlameDescriptor(         ├─ kind=renderSetting → rs[key] = val
     ├─ sensitivity                     draft =>                    ├─ kind=transformAffine → t[mat][key] = val
     ├─ range                              applyAudio(...)          ├─ kind=transformProperty → t[prop] = val
     └─ attackMs/releaseMs               )                         ├─ kind=variationWeight → t.vars[type].weight = val
                                                                   └─ kind=finalAffine → final[key] = val
```

### Panel needs access to transforms

`AudioReactivePanel` needs to know available transforms (count + names) to
populate the transform-index dropdown. Add a new prop:

```typescript
transforms: TransformInfo[]   // { id: string; index: number; label: string }
```

Supplied by `MainWorkspace` which reads `flameDescriptor.transforms` keys.

## Implementation

### 1. Types: `audioAnalysis.ts`

- Add `FlameTarget` discriminated union type
- Replace `AudioMappingEntry.flameParam: string` with `target: FlameTarget`
- Add `TransformInfo` export
- Update presets to use new target format

### 2. Target resolution: `applyAudioMappingsToFlame`

- Widen signature: `flame: FlameDescriptor` (currently `{ renderSettings?: ... }`)
- Add target resolution switch:
  - `renderSetting` → write to `flame.renderSettings`
  - `transformAffine` → index into `Object.values(flame.transforms)[idx]`, write to `preAffine`/`postAffine`
  - `transformProperty` → same index lookup, write property directly
  - `variationWeight` → index + variation type lookup, write weight
  - `finalAffine` → write to `flame.finalTransform`
- Dirty-check key changes from `mapping.flameParam` to a serialized target key

### 3. UI: `AudioReactivePanel`

- Add `transforms` prop: `TransformInfo[]`
- Each mapping row gains:
  - **Category dropdown**: "Render Setting" | "Affine Param" | "Transform Prop" | "Variation Weight" | "Final Affine"
  - **Transform dropdown** (when applicable): picks transform by index, shows label
  - **Matrix dropdown** (for affine): "Pre-Affine" | "Post-Affine"
  - **Param dropdown**: context-sensitive options
    - Render setting: existing list
    - Affine: a, b, c, d, e, f (+ range hints like [-1, 1] default)
    - Transform prop: probability, color X, color Y, color speed
    - Variation weight: existing variation types for selected transform
    - Final affine: a, b, c, d, e, f
- `addMapping()` default: renderSetting → vibrancy (safe, backward-compatible)
- Presets remain render-setting only, but custom preset supports all targets

### 4. MainWorkspace wiring

- Derive `transformInfos` from `flameDescriptor.transforms` keys
- Pass to `AudioReactivePanel`
- No changes to `useAudioReactive` (already passes full draft to `applyAudioMappingsToFlame`)

### 5. Backward compatibility

- `applyAudioMappingsToFlame` accepts old `flameParam: string` OR new `target: FlameTarget`
- During a transition period, check `'flameParam' in mapping` vs `'target' in mapping`
- Remove legacy path in a follow-up cleanup

## Scope & order

| Step | Description                                      | Files touched                                | Risk                          |
| ---- | ------------------------------------------------ | -------------------------------------------- | ----------------------------- |
| 1    | Types: `FlameTarget`, update `AudioMappingEntry` | `audioAnalysis.ts`, `AudioReactivePanel.tsx` | Medium (type changes cascade) |
| 2    | Target resolution in `applyAudioMappingsToFlame` | `audioAnalysis.ts`                           | Medium (core logic)           |
| 3    | UI: category + transform + matrix selectors      | `AudioReactivePanel.tsx` + CSS               | Low (additive)                |
| 4    | Wire `transforms` prop from MainWorkspace        | `MainWorkspace.tsx`                          | Low                           |
| 5    | Update presets to new format                     | `AudioReactivePanel.tsx`                     | Low                           |
| 6    | `pnpm check` + fix                               | —                                            | Low                           |

## Out of scope (future)

- Variation-specific params (e.g., `julia.power`, `linear3D.amount`) — requires per-variation param metadata
- Multi-transform targeting (one mapping → many transforms)
- Audio-reactive transform add/remove
- Keyframing of audio mappings over time
