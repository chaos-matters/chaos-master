# Home community showcase

Status: **implemented and awaiting upstream review** on
`feat/home-community-showcase`.
Updated 2026-08-21.

## Product direction

Home has two complementary collections:

- **Editorial collections** — Lumen originals, exact mathematical classics,
  remixes, and invited artist editions curated deliberately by the team.
- **From the community** — an independently scrolling rail of flames shared to
  Discord, explicitly submitted for consideration, and approved by a human.

The community rail is not a live Discord feed. Sharing to Discord remains the
primary action; showcase submission is a separate, unchecked opt-in. An opted-in
work stays private to the moderation queue until approved.

## Implemented slice

### Submission lifecycle

1. The Discord share modal asks for an explicit showcase opt-in and explains
   that the flame and public author credit may be featured after moderation.
2. A successful Discord share stages a bounded, validated descriptor in D1 as
   `submission_source = 'discord'`, `moderation_status = 'pending'`, and
   `published = 0`.
3. The shared PNG becomes the pending poster in R2. Failure to stage the row or
   poster never turns a successful Discord share into a failed share.
4. `gallery-admin submissions` lists the queue. `approve` runs the existing
   rights/poster publication gate and atomically approves + publishes;
   `reject` keeps the row for audit while unpublishing it.
5. Public gallery reads return Discord rows only when they are both approved
   and published. Curated rows retain their existing behaviour.

Custom-variation flames can still be shared to Discord, including their
portable share-link payload, but cannot enter this showcase yet: gallery rows
do not carry the custom WGSL definitions required to render them faithfully.

### Home presentation

- Approved community work lives in a dedicated horizontal rail and is excluded
  from the editorial wall, preventing the same piece from appearing twice.
- The rail reuses Home's visibility-gated `Plate` renderer. Off-screen tiles do
  not create WebGPU canvases, and posters remain the fallback.
- The section and its navigation item are absent when no approved work exists.
- Tile width and height are explicit, scrolling reserves a real scrollbar
  gutter, and reduced-motion users do not get smooth programmatic scrolling.

### Schema and deployment

- Migration `0006_gallery_community_submissions.sql` adds the source,
  moderation, consent-version, and review fields without changing existing
  curated rows.
- A merge to upstream `main` applies pending migrations to the remote **dev** D1
  database before deploying the dev Worker.
- Production migrations remain an explicit release action.
- Schema deployment does **not** seed or publish artwork. Content remains a
  deliberate editorial operation through `gallery-admin`.
- The Worker can serve the old dev schema during a PR preview, but showcase
  staging reports unavailable until migration 0006 is present. Normal Discord
  sharing still succeeds.

## Security, consent, and data boundaries

- Turnstile, the per-minute limiter, and the daily per-IP share cap run before
  both the Discord post and optional staging.
- The Worker revalidates the flame and timeline, limits descriptor and image
  sizes, rejects custom variations, sanitizes public title/author text, and
  only accepts a same-origin Lumen share URL.
- Consent is versioned (`home-showcase-v1`) so a future material change to the
  public-use terms cannot silently reuse an older opt-in.
- Pending and rejected rows are never returned by public gallery endpoints.
- The consent copy includes a removal path. The operational removal mechanism
  is `reject` or unpublish today; a self-service request flow is future work.

## Dev launch checklist

After this feature merges:

1. Confirm the CI migration step completed for `chaos-master-content-dev`.
2. Stage the three new Lumen works through the normal shared-content path:
   **Neon Julian Cosmos**, **Golden Apollonian Gasket**, and
   **Cybernetic Swirl**.
3. Capture and inspect their posters, then publish them with their embedded and
   gallery credit both set to **Lumen Apeiron**.
4. Unpublish the replaced generic wall rows after the new plates are visibly
   correct: `aurora-drift`, `ember-lattice`, `tidal-bloom`, `spectrum-swirl`,
   `enchanted-rose`, and `deep-current`.
5. Submit one test flame from the dev app, verify it appears under
   `gallery-admin submissions --env dev`, approve it, and confirm the Home rail
   appears without duplicating it in an editorial collection.
6. Test rejection, re-approval, missing-poster refusal, and public removal.

The checked-in seed is a local preview fixture. It intentionally cannot write
to shared dev or production, so merging code never silently rewrites the public
gallery.

## Next phases

1. **Moderation UI.** Add approve/reject controls to the internal
   company-report/admin viewer, backed by an authenticated server endpoint.
   The CLI remains the policy reference and emergency path.
2. **Discord backfill.** Import already-shared works only after obtaining the
   same explicit permission, or ask artists to re-share with the new checkbox.
   Do not infer consent from an old Discord post.
3. **Artist and removal workflows.** Durable artist profiles, preferred links,
   attribution edits, and a documented removal-request route.
4. **Scale.** Cursor pagination/lazy descriptor loading, duplicate detection,
   moderation notes, and basic spam/approval analytics before the rail becomes
   large.
5. **Portable custom variations.** Design a bounded, reviewable gallery format
   for definitions/WGSL before custom-variation works can be approved.
6. **Animation fidelity.** Decide whether community previews should retain the
   shared timeline's fps/duration/loop configuration rather than using Home's
   normalized preview timing.
7. **Classics expansion.** Finish the remaining exact classics and pair each
   with one clearly labelled Lumen remix, following the launch roadmap.

## Deliberate non-goals for this slice

- No automatic publication from Discord.
- No bulk scrape of Discord history or external galleries.
- No production migration or remote content mutation from a PR.
- No public moderation endpoint without authentication and authorization.
- No attempt to execute unreviewed custom WGSL in Home.
