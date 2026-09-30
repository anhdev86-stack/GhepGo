-- CreateEnum
CREATE TYPE "ComplaintPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "complaints"
  ADD COLUMN "priority" "ComplaintPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "firstResponseDueAt" TIMESTAMP(3),
  ADD COLUMN "dueAt" TIMESTAMP(3),
  ADD COLUMN "firstResponseAt" TIMESTAMP(3),
  ADD COLUMN "overdueNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "assigneeId" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3);

-- Backfill deadlines for existing rows with the NORMAL policy (4h first response, 48h resolution)
UPDATE "complaints"
SET "firstResponseDueAt" = "createdAt" + INTERVAL '4 hours',
    "dueAt" = "createdAt" + INTERVAL '48 hours';
UPDATE "complaints" c
SET "firstResponseAt" = (
  SELECT MIN(m."createdAt") FROM "complaint_messages" m
  JOIN "users" u ON u."id" = m."authorId" AND u."role" = 'ADMIN'
  WHERE m."complaintId" = c."id"
)
WHERE "firstResponseAt" IS NULL;

ALTER TABLE "complaints"
  ALTER COLUMN "firstResponseDueAt" SET NOT NULL,
  ALTER COLUMN "dueAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "complaints_status_dueAt_idx" ON "complaints"("status", "dueAt");
CREATE INDEX "complaints_assigneeId_status_idx" ON "complaints"("assigneeId", "status");

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
