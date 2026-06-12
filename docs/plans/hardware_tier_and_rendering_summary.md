# Status: IMPLEMENTED

## Hardware Tier & IFS Rendering Optimization Summary

This document summarizes the recent architectural and feature changes implemented for dynamic hardware tier detection, IFS rendering stability, and layout adjustments.

### 1. Hardware Tier Auto-Detection & Benchmarking
- **WebGL-based Benchmark**: Implemented a lightweight benchmark (`detectHardwareTier`) that executes a fragment shader to estimate GPU FLOPs/s. It safely limits execution to 3 passes (max 50ms each) to prevent locking up the main thread or crashing the browser.
- **Classification System**: Devices are categorized into `low`, `mid`, or `high` tiers based on computed operations per second, with specific safe defaults for each tier.
- **Persistent State & UX**: 
  - The tier is cached in `localStorage` using a persistent SolidJS signal so the benchmark isn't repeatedly run on subsequent launches.
  - The **Welcome Screen** now automatically detects the tier on the first visit, showing a "Detecting optimal settings..." state.
  - The **About / Help Panel** has been updated to display the active tier, allowing the user to manually override it or re-run the benchmark ("Detect Again" button).

### 2. Impact on IFS Rendering & Stability
- **Dynamic Quality Scaling**: The primary rendering architecture remains identical, but the default settings applied to it now scale intelligently:
  - Initial Quality Defaults (`ActionWidget`): Instead of blindly forcing `high` quality on startup, the editor correctly respects the hardware tier (`low` = 0.25, `mid` = 0.5, `high` = 1.0).
  - Background processes, gallery thumbnails, and the variation selector preview correctly throttle their `renderInterval` and point counts on lower-tier hardware.
- **Tablet / Low-End Device Fixes**: The issue where the tablet GPU crashed in Chrome was mitigated. By categorizing the tablet as `low` tier and restricting the variation previews (IFS views) to use fewer points/samples per frame, UI thread blocking and WebGL context loss have been eliminated.
- **Regular Rendering**: Regular rendering is **unaffected** in terms of logic or capability. Users on `high` tier hardware still get 100% full performance, while lower-tier users get a smooth UI and can manually bump up quality if they choose to stress-test their device.

### 3. Device Memory Reporting Note
- The "Copy Info" feature in the About panel sometimes reports `~32GB` RAM even on `64GB` machines. This happens because the browser's `navigator.deviceMemory` API intentionally caps the reported memory at `8GB` or `32GB` to prevent fingerprinting, and it reports **System RAM**, not VRAM. VRAM cannot currently be reliably extracted via standard web APIs.

### 4. Variation Selector Layout Adjustments
- **Search Bar Alignment**: The `.search-bar` element was explicitly extracted from the scrollable sidebar and pinned to the very top left of the modal via CSS Grid (`grid-area: search`).
- **Right-side IFS Alignment**: A dummy spacer element (`ui.dummyHeader`) was introduced to occupy the top right grid cell. This successfully pushed the right-side IFS canvas down perfectly in line with the left-side variation thumbnails.
- **Modal Overflow Fix**: The `.variation-selector-wrapper` was constrained to `calc(90vw - 2 * var(--space-4))` instead of blindly using `100vw`. This keeps the wrapper safely inside the modal's padded content box, ensuring the `X` close button is perfectly positioned in the top right corner without being cropped.
