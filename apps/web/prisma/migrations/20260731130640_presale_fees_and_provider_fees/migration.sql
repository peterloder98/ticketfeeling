-- AlterTable
ALTER TABLE "events" ADD COLUMN     "presale_fee_fixed_cents" INTEGER,
ADD COLUMN     "presale_fee_mode" TEXT,
ADD COLUMN     "presale_fee_percent_bps" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "fee_gross_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fee_net_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fee_snapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "fee_tax_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tickets_gross_cents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "presale_fee_fixed_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "presale_fee_mode" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "presale_fee_percent_bps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "presale_fee_tax_rate_bps" INTEGER NOT NULL DEFAULT 700;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "net_settled_cents" INTEGER,
ADD COLUMN     "provider_fee_cents" INTEGER;
