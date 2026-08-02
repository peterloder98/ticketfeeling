-- Durable cover/media uploads for serverless (Vercel has no writable public/uploads)
CREATE TABLE IF NOT EXISTS "uploaded_assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'cover',
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "uploaded_assets_organization_id_kind_idx" ON "uploaded_assets"("organization_id", "kind");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uploaded_assets_organization_id_fkey'
  ) THEN
    ALTER TABLE "uploaded_assets"
      ADD CONSTRAINT "uploaded_assets_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
