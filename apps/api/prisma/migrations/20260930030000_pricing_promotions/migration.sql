-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "trips"
  ADD COLUMN "surgeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "promoCode" TEXT,
  ADD COLUMN "fareBreakdown" JSONB;

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoneId" TEXT,
    "baseFare" INTEGER NOT NULL DEFAULT 15000,
    "perKm" INTEGER NOT NULL DEFAULT 11000,
    "perMinute" INTEGER NOT NULL DEFAULT 0,
    "minFare" INTEGER NOT NULL DEFAULT 20000,
    "roundTo" INTEGER NOT NULL DEFAULT 500,
    "sharedDiscountPct" INTEGER NOT NULL DEFAULT 25,
    "nightSurchargePct" INTEGER NOT NULL DEFAULT 0,
    "nightStartHour" INTEGER NOT NULL DEFAULT 22,
    "nightEndHour" INTEGER NOT NULL DEFAULT 5,
    "surgeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "surgeMax" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "cancellationFee" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" "PromotionType" NOT NULL,
    "value" INTEGER NOT NULL,
    "maxDiscount" INTEGER,
    "minFare" INTEGER NOT NULL DEFAULT 0,
    "tripType" "TripType",
    "firstRideOnly" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_redemptions" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rules_zoneId_key" ON "pricing_rules"("zoneId");
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");
CREATE UNIQUE INDEX "promotion_redemptions_tripId_key" ON "promotion_redemptions"("tripId");
CREATE INDEX "promotion_redemptions_promotionId_userId_idx" ON "promotion_redemptions"("promotionId", "userId");

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "service_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
