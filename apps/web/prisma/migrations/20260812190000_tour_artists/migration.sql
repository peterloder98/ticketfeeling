-- Tour-central artists with optional per-event overrides
CREATE TABLE IF NOT EXISTS "tour_artists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tour_id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'artist',
    "is_headliner" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "announced" BOOLEAN NOT NULL DEFAULT true,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "tour_artists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tour_artists_tour_id_artist_id_key" ON "tour_artists"("tour_id", "artist_id");

DO $$ BEGIN
  ALTER TABLE "tour_artists" ADD CONSTRAINT "tour_artists_tour_id_fkey"
    FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tour_artists" ADD CONSTRAINT "tour_artists_artist_id_fkey"
    FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "artists_use_tour_defaults" BOOLEAN NOT NULL DEFAULT true;

-- Seed tour artists from the earliest tour date that already has a line-up (idempotent).
INSERT INTO "tour_artists" ("id", "tour_id", "artist_id", "role", "is_headliner", "sort_order", "announced", "cancelled")
SELECT gen_random_uuid(), src.tour_id, src.artist_id, src.role, src.is_headliner, src.sort_order, src.announced, src.cancelled
FROM (
  SELECT DISTINCT ON (e.tour_id, ea.artist_id)
    e.tour_id,
    ea.artist_id,
    ea.role,
    ea.is_headliner,
    ea.sort_order,
    ea.announced,
    ea.cancelled
  FROM "events" e
  INNER JOIN "event_artists" ea ON ea.event_id = e.id
  WHERE e.tour_id IS NOT NULL
    AND e.id = (
      SELECT e2.id
      FROM "events" e2
      INNER JOIN "event_artists" ea2 ON ea2.event_id = e2.id
      WHERE e2.tour_id = e.tour_id
      ORDER BY e2.event_starts_at ASC NULLS LAST, e2.created_at ASC
      LIMIT 1
    )
  ORDER BY e.tour_id, ea.artist_id, ea.sort_order
) src
WHERE NOT EXISTS (
  SELECT 1 FROM "tour_artists" ta WHERE ta.tour_id = src.tour_id
);

-- Events whose line-up matches the tour set → inherit (clear per-event links).
DELETE FROM "event_artists" ea
WHERE ea.event_id IN (
  SELECT es.event_id
  FROM (
    SELECT e.id AS event_id, e.tour_id,
           COALESCE(
             array_agg(ea2.artist_id ORDER BY ea2.sort_order, ea2.artist_id)
               FILTER (WHERE ea2.artist_id IS NOT NULL),
             '{}'::uuid[]
           ) AS artist_ids
    FROM "events" e
    LEFT JOIN "event_artists" ea2 ON ea2.event_id = e.id
    WHERE e.tour_id IS NOT NULL
    GROUP BY e.id, e.tour_id
  ) es
  INNER JOIN (
    SELECT tour_id, array_agg(artist_id ORDER BY sort_order, artist_id) AS artist_ids
    FROM "tour_artists"
    GROUP BY tour_id
  ) ts ON ts.tour_id = es.tour_id
  WHERE es.artist_ids = ts.artist_ids
);

UPDATE "events" e
SET "artists_use_tour_defaults" = true
WHERE e.tour_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "event_artists" ea WHERE ea.event_id = e.id);

-- Divergent event line-ups keep their EventArtist rows as overrides
UPDATE "events" e
SET "artists_use_tour_defaults" = false
WHERE e.tour_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM "event_artists" ea WHERE ea.event_id = e.id);
