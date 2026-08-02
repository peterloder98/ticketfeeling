-- AlterTable
ALTER TABLE "events" ADD COLUMN "venue_plan_id" UUID;

-- CreateIndex
CREATE INDEX "events_venue_plan_id_idx" ON "events"("venue_plan_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_venue_plan_id_fkey" FOREIGN KEY ("venue_plan_id") REFERENCES "venue_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
