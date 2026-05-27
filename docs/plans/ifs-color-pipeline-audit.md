# IFS Color Pipeline and Palette Audit

**Status**: COMPLETED

This document provides a comprehensive audit of the color processing pipeline in the Flame Fractal (IFS) compute engine, specifically addressing how color is accumulated, mixed, and graded, as well as the difference between transform-specific color properties and global palette grading settings.

---

## 1. Overview

The fractal color processing in this project is split into two distinct phases, mapping directly to the WebGPU computation and rendering passes:

1. **IFS Compute Pipeline (Accumulation)**: Determines the raw 2D color coordinates of points during the iterative chaos game.
2. **Color Grading Pipeline (Render/Tone Mapping)**: Translates accumulated density and color buckets into final screen pixels using a palette and tone mapping curves.

---

## 2. Transform `Color Speed` vs. Palette Sidebar Options

To answer the core question: **Is the palette sidebar options doing anything, and what is the difference between transform color speed and palette options?**

Yes, the palette sidebar options are fully wired up and functional. However, they govern completely different parts of the render pipeline compared to `transform color speed`.

### Transform `colorSpeed` (IFS Phase)
- **Scope**: Local (Per-Transform)
- **Phase**: Iteration / Accumulation
- **Mechanism**: In Iterated Function Systems (IFS), every transform has an assigned color coordinate. When a point lands on a specific transform during the chaos game, its internal color value shifts towards that transform's color. 
- **Code Reference**: In `src/flame/transformFunction.ts`, the WGSL shader interpolates the color on each iteration:
  ```wgsl
  let color = mix(point.color, uniforms.color, uniforms.colorSpeed);
  ```
- **Effect**: A higher `colorSpeed` means the point's color will jump more aggressively toward the transform's base color. A lower speed causes the point to retain the color history of previous transforms for longer.

### Palette Sidebar Options (Color Grading Phase)
- **Scope**: Global
- **Phase**: Render / Post-Processing
- **Mechanism**: These options dictate how the accumulated mathematical density is translated into visual color. They operate inside `src/flame/colorGrading.ts`.
- **Effect**:
  - **Palette Speed**: Controls how quickly the palette maps across the density scale. It scales the density input before it samples the palette.
  - **Palette Mode**: Dictates the mathematical method of applying the palette:
    - `0` (Density Shift): Shifts the density lookup index directly using the Phase.
    - `1` (flam3 Hue Rotation): Uses the OkLab color space to perform a pure hue rotation based on the Phase, while density dictates the baseline color from the palette.
  - **Palette Phase**: Determines the offset. In mode 0, it offsets the lookup index. In mode 1, it dictates the rotation angle (`phase * 2π`).

---

## 3. The Two-Stage Pipeline

### Stage 1: The IFS Compute Pipeline (`src/flame/transformFunction.ts`)
The WebGPU compute shader is dynamically generated in `createFlameWgsl` based on the active variations and transforms.

1. **Uniform Extraction**: `extractFlameUniforms` packages `color` and `colorSpeed` into the uniform buffer `FlameUniformsBase`.
2. **Iteration Execution**: Points are multiplied by the pre-affine transform, passed through variations, and multiplied by the post-affine transform.
3. **Color Mixing**: The point's new color vector is computed via `mix(point.color, uniforms.color, uniforms.colorSpeed)`.
4. **Bucket Accumulation**: These coordinates are eventually rasterized into a histogram (accumulation buffer), incrementing both density count and color components.

### Stage 2: The Color Grading Pipeline (`src/flame/colorGrading.ts`)
The Color Grading pipeline reads the accumulation buffer and outputs the final frame. The Uniforms (`ColorGradingUniforms`) are correctly synced with the main application state (`flameDescriptor.renderSettings`).

1. **Density Calculation**: The buffer count is adjusted relative to iterations. The density is computed logarithmically: `log(adjustedCount + 1)`.
2. **Palette Application (if Vibrancy > 0 and Palette exists)**:
   - Evaluates a `logDensity` scale.
   - Calculates the `paletteScale` based on the user-defined **Palette Speed**: `0.02 + (paletteSpeed * 0.298)`.
   - **Mode 0 (Density Shift)**: `fract(logDensity * paletteScale + palettePhase)`.
   - **Mode 1 (Hue Rotation)**: Base index is `fract(logDensity * paletteScale)`. The fetched color is hue-rotated in OkLab space using a rotation matrix derived from **Palette Phase**.
3. **Vibrancy Blending**: The generated palette color is smoothly blended with the raw accumulated point color using the `vibrancy` scalar and a calculated base alpha.
4. **Tone Mapping**: Finally, global exposure, contrast, and gamma corrections are applied to construct the final OkLab color, which is subsequently converted to RGB. Highlights are desaturated using the `highlightPower` scalar.

---

## 4. Conclusion & Audit Results

**Verdict**: The color pipeline is structurally sound, mathematically correct according to the flam3 algorithm specifications, and fully wired up.

- **UI Wiring**: `MainWorkspace.tsx` successfully binds the timeline inputs to the `flameDescriptor.renderSettings` (Lines ~2420-2500).
- **WebGPU Wiring**: The render pass correctly extracts these values into the `ColorGradingUniforms` buffer.
- **Shader Logic**: The `colorGrading.ts` fragment shader processes these fields perfectly without any visible disconnected pathways.
