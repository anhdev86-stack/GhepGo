-- CreateEnum
CREATE TYPE "TripGroupStatus" AS ENUM ('MATCHING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StopKind" AS ENUM ('PICKUP', 'DROPOFF');

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "seatsRequested" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "trip_groups" (
    "id" TEXT NOT NULL,
    "status" "TripGroupStatus" NOT NULL DEFAULT 'MATCHING',
    "driverId" TEXT,
    "vehicleId" TEXT,
    "seatsTotal" INTEGER NOT NULL,
    "seatsUsed" INTEGER NOT NULL DEFAULT 0,
    "totalDistanceMeters" INTEGER,
    "currentStopIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_stops" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "kind" "StopKind" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "trip_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_groups_status_idx" ON "trip_groups"("status");

-- CreateIndex
CREATE INDEX "trip_stops_tripId_idx" ON "trip_stops"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "trip_stops_groupId_sequence_key" ON "trip_stops"("groupId", "sequence");

-- CreateIndex
CREATE INDEX "trips_groupId_idx" ON "trips"("groupId");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "trip_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_groups" ADD CONSTRAINT "trip_groups_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_groups" ADD CONSTRAINT "trip_groups_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "trip_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
