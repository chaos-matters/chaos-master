# Chaos Master FP - Codebase Audit Report

## Current State

Chaos Master FP is a WebGPU-accelerated fractal flame editor built with SolidJS and TypeScript. It leverages `typegpu` for strongly-typed WGSL shader generation and provides a highly interactive, real-time editing experience.

### Architecture Highlights
* **Core Rendering**: `Flam3.tsx` and the `flame/wgsl` modules form a robust GPU-based renderer for the chaos game, density estimation, and color mapping.
* **Shader Generation**: The use of `typegpu` in `transformFunction.ts` to dynamically assemble WGSL based on the user's active variations is elegant and highly performant.
* **State Management**: Uses SolidJS primitives (`createSignal`, `createStore`) effectively, with a custom `ChangeHistoryContext` for undo/redo.
* **UI/UX**: Extensive use of direct manipulation (e.g., `AffineEditor`, `WheelZoomCamera2D`, timeline scrubbing).

## Areas for Improvement & Refactoring

### 1. `MainWorkspace.tsx` is Overly Monolithic
At over 2,100 lines, `MainWorkspace.tsx` has become a bottleneck for maintainability. It contains the main canvas, the sidebar, timeline, modal logic, and numerous floating action buttons.
**Recommendation**: Extract sections into dedicated components:
* `Sidebar.tsx` (containing Transform list, Render Settings, etc.)
* `FloatingToolbar.tsx` (for the canvas overlay actions)
* Move the complex state initialization into a dedicated context or store file (e.g., `useFlameEditorState()`).

### 2. Affine Editor Limitations
Currently, `AffineEditor.tsx` is hardcoded to only edit `preAffine`. However, the underlying schema and WGSL shaders already support `postAffine`! The UI simply hides this capability.
**Recommendation**: Add a toggle in the Affine Editor tabs (or a separate tab) to switch between editing the "Pre-Transform" (`preAffine`) and "Post-Transform" (`postAffine`).

### 3. Hardcoded Color Speed
In `transformFunction.ts`, the color coordinate update is hardcoded:
```wgsl
let color = mix(point.color, uniforms.color, 0.4);
```
Standard Flam3 specifies a `color_speed` per transform (usually ranging from 0 to 1). 
**Recommendation**: Add `colorSpeed` to `TransformFunction` in the schema and expose it via the UI, replacing the hardcoded `0.4`.

### 4. Missing Global "Final Transform"
The current engine applies $F_i(x)$ iteratively. However, the original Flam3 specification includes a **Final Transform** (or "post transform" globally), which is a single transform applied unconditionally to every point *after* the chaos game loop and *before* plotting to the histogram.
**Recommendation**: Add a `finalTransform` object to the `FlameDescriptor` schema and integrate it into the `iter.wgsl` plotting loop.

### 5. Symmetry Support
Symmetry in Flam3 is typically achieved by adding specialized transforms that rotate/reflect the point *without* advancing the color coordinate. Currently, adding such transforms is entirely manual, and because of the hardcoded color mix, they "wash out" the fractal's colors.
**Recommendation**:
1. Implement `colorSpeed` (as mentioned above) so symmetry transforms can have `colorSpeed = 0`.
2. Provide a "Quick Add Symmetry" UI that automatically injects a dihedral/rotational symmetry transform group into the `FlameDescriptor`.

## Conclusion
The foundation of Chaos Master FP is extremely strong, with a bleeding-edge WebGPU compute pipeline. The next steps should focus on UI modularity (breaking down `MainWorkspace.tsx`) and closing the feature-gap with the original Flam3 spec (Color Speed, Post-Affine UI, Final Transforms, and Symmetry helpers).
