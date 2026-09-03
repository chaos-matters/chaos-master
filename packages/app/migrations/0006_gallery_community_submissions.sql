-- Community showcase submission state.
--
-- Curated rows keep their existing behaviour through the defaults below.
-- Discord shares are inserted as unpublished/pending and can only become
-- public through the moderation command in gallery-admin.

ALTER TABLE gallery_items ADD COLUMN submission_source TEXT NOT NULL DEFAULT 'curated'
  CHECK (submission_source IN ('curated', 'discord'));
ALTER TABLE gallery_items ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'curated'
  CHECK (moderation_status IN ('curated', 'pending', 'approved', 'rejected'));
ALTER TABLE gallery_items ADD COLUMN consent_version TEXT;
ALTER TABLE gallery_items ADD COLUMN reviewed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_gallery_community
  ON gallery_items (
    submission_source,
    moderation_status,
    published,
    sort_order,
    slug
  );
