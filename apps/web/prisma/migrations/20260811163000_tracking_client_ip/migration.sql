-- Buyer / visitor IP for GA4 Measurement Protocol ip_override and Meta CAPI geo

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "client_ip" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "client_user_agent" TEXT;

ALTER TABLE "tracking_sessions" ADD COLUMN IF NOT EXISTS "client_ip" TEXT;
