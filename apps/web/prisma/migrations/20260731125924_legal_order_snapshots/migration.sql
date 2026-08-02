-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "contract_snapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "organizer_snapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "seller_snapshot" JSONB NOT NULL DEFAULT '{}';
