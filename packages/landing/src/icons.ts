// Inline SVG strings shared across static Astro components (footer link + the
// "Launch" CTA buttons), so the launch/external-link glyph has one source of
// truth instead of being pasted per-file. Lifted from the app's icon set.
export const LAUNCH_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 13.5V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h4.5"/></svg>'
