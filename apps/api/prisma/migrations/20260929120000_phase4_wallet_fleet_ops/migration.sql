-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('TOPUP', 'TRIP_PAYMENT', 'TRIP_EARNING', 'COMMISSION', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WalletTxStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('ACTIVE', 'ENDED');

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "zoneId" TEXT;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "status" "WalletTxStatus" NOT NULL DEFAULT 'COMPLETED',
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "tripId" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankAccount" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_shifts" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "driver_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_createdAt_idx" ON "wallet_transactions"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_transactions_tripId_idx" ON "wallet_transactions"("tripId");

-- CreateIndex
CREATE INDEX "withdrawals_status_idx" ON "withdrawals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "service_zones_name_key" ON "service_zones"("name");

-- CreateIndex
CREATE INDEX "driver_shifts_driverId_startedAt_idx" ON "driver_shifts"("driverId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_tripId_key" ON "ratings"("tripId");

-- CreateIndex
CREATE INDEX "ratings_driverId_idx" ON "ratings"("driverId");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "service_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_shifts" ADD CONSTRAINT "driver_shifts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

