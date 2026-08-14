-- Hard-lock limited discount codes / gift cards at checkout (before Stripe).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promotions_reserved_at" TIMESTAMP(3);
