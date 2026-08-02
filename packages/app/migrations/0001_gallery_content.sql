-- Gallery content for the Home tab.
--
-- The row IS the artwork: `flame` holds a full FlameDescriptor JSON and
-- `animation` the optional timeline envelope, exactly as the app's own PNG
-- exports embed them. Home fetches these and renders the real thing on the
-- GPU — the poster in R2 is only the fallback for visitors without WebGPU.
-- Content can therefore be swapped by writing rows, with no redeploy.

CREATE TABLE IF NOT EXISTS gallery_items (
  -- Stable URL-safe identifier, e.g. 'depth-of-abyss'. Chosen by hand rather
  -- than generated so links stay meaningful and stable across reseeds.
  slug            TEXT PRIMARY KEY,

  title           TEXT NOT NULL,
  -- Optional one-line caption shown under the plate.
  caption         TEXT,
  author          TEXT,

  -- Which Home section this belongs to. Kept as free text with a CHECK rather
  -- than a lookup table: the set is small, fixed by the page design, and a
  -- typo should fail loudly at write time.
  section         TEXT NOT NULL CHECK (
    section IN ('hero', 'gallery', 'motion', 'capability')
  ),

  -- For section='capability': which feature this flame demonstrates
  -- ('animation', 'randomizer', 'genetics', 'audio', 'sonification').
  -- NULL for every other section.
  capability      TEXT,

  -- Full FlameDescriptor as JSON text. D1 has no JSON column type; validation
  -- happens in the app against the valibot schema, and the API returns this
  -- verbatim so the client parses exactly what the editor would.
  flame           TEXT NOT NULL,

  -- Timeline/animation envelope as JSON text, or NULL for a still.
  animation       TEXT,

  -- Denormalised from `flame` so the list endpoint can be rendered, sorted and
  -- filtered without parsing every descriptor.
  dimensions      INTEGER NOT NULL DEFAULT 2 CHECK (dimensions IN (2, 3)),
  transform_count INTEGER NOT NULL DEFAULT 0,

  -- R2 object key for the pre-rendered poster (no-WebGPU fallback), and its
  -- intrinsic size so the layout can reserve space before it loads.
  poster_key      TEXT,
  poster_width    INTEGER,
  poster_height   INTEGER,

  -- Hand-set ordering within a section; ties break on slug for determinism.
  sort_order      INTEGER NOT NULL DEFAULT 0,

  -- Lets a row be staged in the database before it goes live on Home.
  published       INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The list endpoint's access pattern: published rows of one section, in order.
CREATE INDEX IF NOT EXISTS idx_gallery_section
  ON gallery_items (published, section, sort_order, slug);

-- Keep updated_at honest without the API having to remember to set it.
CREATE TRIGGER IF NOT EXISTS trg_gallery_items_updated_at
AFTER UPDATE ON gallery_items
FOR EACH ROW
BEGIN
  UPDATE gallery_items
     SET updated_at = datetime('now')
   WHERE slug = OLD.slug;
END;
