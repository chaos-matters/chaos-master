# Project Conventions & SolidJS Best Practices

This document outlines the core patterns, conventions, and SolidJS best practices used throughout this project, heavily inspired by the architecture of our Reactivity and WebGPU pipeline integrations.

## 1. State Management & Reactivity

### 1.1 Event-Driven Updates vs. Reactive Synchronization
**Rule of Thumb:** Prefer updating state imperatively in event handlers (e.g., `onChange`, `onClick`) over synchronizing duplicated state using `createEffect`.

**Why:** Using `createEffect` to sync local component state with a global store can easily cause recursive reactivity (infinite loops, e.g., `Maximum call stack size exceeded`), especially when working with deep stores, arrays, and `<For>` loops. 

*Good (Event-Driven):*
```tsx
<select
  onChange={(ev) => {
    const mode = ev.currentTarget.value;
    
    // 1. Update global store
    props.setGlobalMode(mode); 
    
    // 2. Update local/derived stores imperatively
    setLocalExamples((draft) => {
      draft.forEach(item => item.mode = mode);
    });
  }}
/>
```

*Bad (Recursive Sync):*
```tsx
createEffect(() => {
  const mode = props.globalMode;
  // Modifying local stores reactively can trigger downstream effects 
  // that inadvertently update the global state or unmount/remount components, 
  // leading to an infinite loop.
  setLocalExamples(...)
});
```

### 1.2 Fine-Grained Stores and Structura.js
We use `solid-js/store` combined with `structurajs` (`produceWithPatches`) for our undo/redo history (`ChangeHistoryContext`).
- Always mutate drafts safely within `produce` callbacks. 
- Deep mutations on objects in a store will trigger UI updates only for components explicitly reading those properties.
- When mapping over a store with `<For each={recordEntries(store)}>`, avoid completely replacing the store if you don't want the children to completely unmount and remount. 

### 1.3 `Show` Component and the `keyed` Property
When you need to force a component to remount completely (e.g., to clear out old non-reactive internal state or unmount WebGPU canvases), use `<Show keyed>`.

**Important Type Safety Note:** 
In SolidJS, `<Show keyed>` requires the children to be a function that accepts the evaluated truthy condition as an argument.

*Correct:*
```tsx
<Show when={galleryKey()} keyed>
  {(key) => <MyComponent id={key} />}
</Show>
```
*Incorrect (will throw TS errors):*
```tsx
<Show when={galleryKey()} keyed>
  {() => <MyComponent />} 
</Show>
```

## 2. WebGPU Pipeline and Caching

### 2.1 Generating Pipeline Signatures
Because compiling WebGPU pipelines (e.g., IFS or Color Grading) is expensive, we cache our WGSL pipelines using a JSON string signature (`sig`).

**Critical Convention:** Any parameter that alters the structure, logic, or behavior of the generated WGSL closure MUST be included in the cache signature.

*Example:*
```typescript
const sig = JSON.stringify({
  insideShaderCount,
  colorInitType,
  pointInitType, // Must be included if it dictates which wgsl code is generated!
  transforms: ...
});
```

Failure to include a mode in the signature will result in the app reusing the cached WGSL program even after the user changes settings in the UI, making it appear as if the UI is broken or frozen.

### 2.2 Unmounting WebGPU Canvases 
WebGPU buffers consume significant VRAM. When components using `<Flam3>` are hidden or scrolled out of view, they must clean up their resources. 
- Use synchronous `destroy()` calls in `onCleanup` for large GPU buffers (`accumulationBuffer`, `postprocessBuffer`, `pointRandomSeeds`).
- **Do not** wrap buffer destruction in `requestAnimationFrame`. Rapid remounts (e.g., closing and opening a modal) can cause old buffers to overlap with new ones before the animation frame executes, doubling VRAM usage and causing Out Of Memory (OOM) crashes.

## 3. DOM & UI Conventions

- **View Transitions:** Use `document.startViewTransition` for seamless transitions between major layout shifts (e.g., toggling the sidebar, changing themes).
```tsx
document.startViewTransition(() => {
  setFlameDescriptor((draft) => {
    draft.renderSettings.drawMode = mode
  })
})
```
- **Avoid Emojis:** Per project rules, avoid unicode emojis in the UI. Always use consistent SVG icons (e.g., from `src/icons`).
- **Glassmorphism & Theming:** Use CSS variables mapped to the current theme (`light` or `dark`). Backgrounds and dropdowns should maintain the app's standard dark aesthetics and transparency layers where required.
