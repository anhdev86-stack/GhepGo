-- AlterTable
ALTER TABLE "trip_groups" ADD COLUMN     "zoneId" TEXT;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "pickupZoneId" TEXT;

-- CreateIndex
CREATE INDEX "trip_groups_zoneId_status_idx" ON "trip_groups"("zoneId", "status");

-- CreateIndex
CREATE INDEX "trips_pickupZoneId_status_idx" ON "trips"("pickupZoneId", "status");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_pickupZoneId_fkey" FOREIGN KEY ("pickupZoneId") REFERENCES "service_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_groups" ADD CONSTRAINT "trip_groups_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "service_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

