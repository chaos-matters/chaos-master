# UI Bug Fixes Report: Post-Rebase Audit

This document details the root causes and solutions for several UI and rendering bugs that were identified and fixed following the main branch rebase.

## 1. `useComputeGate` Crash on Left Click
**Symptom**: Clicking a variation button in the sidebar triggered an application crash with the error: `App.tsx:2215 Error: Called 'useComputeGate' outside of <ComputeContext>`.
**Root Cause**: The error was caused by SolidJS Hot Module Replacement (HMR) during development. The `createGateContext` function was being called directly inside `VariationSelector.tsx`. When Vite hot-reloaded the file, it instantiated a completely new Context. However, `QuickVariationPicker.tsx`, which was not reloaded, still held a reference to the old `<ComputeGate>` provider component. When `VariationPreview` tried to access the context, it looked for the new context but only found the old provider, resulting in an `undefined` context error.
**Fix**: Extracted the `ComputeGate` context creation into a dedicated file (`src/contexts/ComputeGateContext.tsx`). This ensures that the context reference remains stable across HMR updates to UI components.

## 2. Black Variation Previews
**Symptom**: Sometimes variation previews would go completely black after fully rendering. 
**Root Cause**: The WebGPU export logic (`canvas.toBlob`) was working perfectly and capturing the correct image. However, during the rebase, the `.stretch` and `.stretch-done` CSS classes were accidentally dropped from `VariationSelector.module.css`. Because the preview `div` was relying on `.stretch` to apply the exported blob URL as a `background-image`, the missing CSS class meant the `div` had no background and collapsed, appearing as a black void against the dark theme.
**Fix**: Restored the `.stretch` and `.stretch-done` CSS classes to `VariationSelector.module.css`.

## 3. Modal-in-Modal Unmounting Bug (About -> Changelog)
**Symptom**: Opening the Changelog modal from within the About modal caused buggy behavior, specifically failing to properly restore the parent modal when the child modal was closed.
**Root Cause**: The `Modal.tsx` component was using `<Show when={modalInstances()[0]} keyed>` to determine which modal to render. This hardcoded index `[0]` meant it would only ever render the *first* modal opened, effectively unmounting it when a second modal was added and then inappropriately re-triggering initialization when the second modal closed.
**Fix**: Restored the `main` branch logic which uses `<Show when={modalInstances().at(-1)} keyed>`. This correctly tracks the most recently opened nested modal and preserves the stack.

## 4. Unclickable Version Info (Timeline Overlap)
**Symptom**: The version info pill in the bottom right corner of the screen could not be clicked when the Timeline Editor was open.
**Root Cause**: The `.version` class was styled with `position: absolute` relative to the `.bottom-bar` container. Because the `.timeline-wrapper` was rendered below the view controls within the same flex column and possessed its own stacking context, it visually overlapped the absolutely positioned version pill, intercepting pointer events.
**Fix**: Changed the `.version` CSS class in `SoftwareVersion.module.css` from `position: absolute` to `position: fixed`. This anchors it to the viewport, ensuring it always sits on top of all other panels and remains clickable.

## 5. Changelog Icon Loading
**Symptom**: The changelog icon appeared missing or improperly loaded.
**Root Cause**: The SVG file (`changelog.svg`) was correctly implemented and identical to `main`. The issue was related to Vite's `vite-plugin-solid-svg` caching/HMR state not properly picking up the new SVG component during the active dev session. 
**Fix**: Restarting the Vite dev server clears the cache and correctly loads the SVG as a SolidJS component.
