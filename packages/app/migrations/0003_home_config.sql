-- Key/value settings for the Home tab.
--
-- Phase 5's "Made here" portal plays a scripted tour. Tours are CODE (see
-- src/tours/registry.ts), so the only part of that choice a database can own is
-- the tour's id — `portal_tour_id`. Storing it here means pointing the portal at
-- a different tour is a row write, exactly like re-curating the gallery in 0001,
-- and needs no deploy.
--
-- Deliberately key/value rather than a one-row settings table: the keys are few,
-- unrelated, and each is written on its own by `gallery-admin config set`, which
-- allowlists the keys it will accept. The client mirrors that allowlist and
-- ignores anything it does not recognise (the same rule `bySection` applies to
-- an unknown gallery section), so content may be newer than the build.

CREATE TABLE IF NOT EXISTS home_config (
  -- The setting's name, e.g. 'portal_tour_id'. Allowlisted by the admin script
  -- rather than by a CHECK constraint: the allowlist has to live in the tool
  -- anyway (to reject a typo before it reaches D1), and a CHECK would make
  -- adding a key a migration instead of a one-line change.
  key        TEXT PRIMARY KEY,

  -- Always text. Every consumer parses what it needs; nothing here is numeric
  -- enough to be worth a second column type.
  value      TEXT NOT NULL,

  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Keep updated_at honest without the writer having to remember it, matching
-- trg_gallery_items_updated_at in 0001.
CREATE TRIGGER IF NOT EXISTS trg_home_config_updated_at
AFTER UPDATE ON home_config
FOR EACH ROW
BEGIN
  UPDATE home_config
     SET updated_at = datetime('now')
   WHERE key = OLD.key;
END;
