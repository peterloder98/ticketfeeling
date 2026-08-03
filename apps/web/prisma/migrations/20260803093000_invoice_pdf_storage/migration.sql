-- Persist generated invoice PDFs for customer + admin download and email re-send.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pdf_data" BYTEA;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pdf_filename" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pdf_emailed_at" TIMESTAMP(3);
