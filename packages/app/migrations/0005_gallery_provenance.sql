-- Public curation metadata for Home gallery rows.
--
-- `author` already stores the artist/creator credit, so provenance extends that
-- row instead of introducing a second source of truth for the same person.
-- Defaults keep older rows readable but deliberately NOT publication-ready:
-- remote publication tooling requires an explicit provenance decision.

ALTER TABLE gallery_items ADD COLUMN collection TEXT NOT NULL DEFAULT 'original'
  CHECK (collection IN ('foundation', 'original', 'remix', 'artist'));
ALTER TABLE gallery_items ADD COLUMN provenance_kind TEXT NOT NULL DEFAULT 'unknown'
  CHECK (
    provenance_kind IN (
      'unknown', 'project-original', 'public-domain', 'licensed', 'permission'
    )
  );
ALTER TABLE gallery_items ADD COLUMN source_url TEXT;
ALTER TABLE gallery_items ADD COLUMN license TEXT;
ALTER TABLE gallery_items ADD COLUMN license_url TEXT;
ALTER TABLE gallery_items ADD COLUMN attribution TEXT;
ALTER TABLE gallery_items ADD COLUMN changes TEXT;
ALTER TABLE gallery_items ADD COLUMN original_id TEXT;

-- These are deterministic in-house encodings of public mathematical
-- constructions, not imported artist works.
UPDATE gallery_items
   SET collection = 'foundation'
 WHERE slug LIKE 'classic-%';
