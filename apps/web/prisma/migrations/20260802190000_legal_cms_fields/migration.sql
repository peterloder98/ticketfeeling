-- AlterTable
ALTER TABLE "legal_documents" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "changelog" TEXT;
ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legal_document_versions_legal_document_id_status_idx"
  ON "legal_document_versions"("legal_document_id", "status");

CREATE INDEX IF NOT EXISTS "order_legal_acceptances_legal_document_version_id_idx"
  ON "order_legal_acceptances"("legal_document_version_id");

-- AddForeignKey (safe if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_legal_acceptances_legal_document_version_id_fkey'
  ) THEN
    ALTER TABLE "order_legal_acceptances"
      ADD CONSTRAINT "order_legal_acceptances_legal_document_version_id_fkey"
      FOREIGN KEY ("legal_document_version_id")
      REFERENCES "legal_document_versions"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
