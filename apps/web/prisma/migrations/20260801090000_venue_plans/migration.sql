-- CreateTable
CREATE TABLE "venue_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "room_id" UUID,
    "name" TEXT NOT NULL,
    "width_cm" INTEGER NOT NULL,
    "depth_cm" INTEGER NOT NULL,
    "objects" JSONB NOT NULL DEFAULT '[]',
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "venue_plans_organization_id_location_id_idx" ON "venue_plans"("organization_id", "location_id");

-- AddForeignKey
ALTER TABLE "venue_plans" ADD CONSTRAINT "venue_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_plans" ADD CONSTRAINT "venue_plans_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_plans" ADD CONSTRAINT "venue_plans_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "location_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
