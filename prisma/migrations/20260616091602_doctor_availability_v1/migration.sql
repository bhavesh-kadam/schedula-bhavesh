/*
  Warnings:

  - You are about to drop the `Availability` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OverrideType" AS ENUM ('MODIFIED', 'UNAVAILABLE');

-- DropForeignKey
ALTER TABLE "Availability" DROP CONSTRAINT "Availability_doctorId_fkey";

-- DropTable
DROP TABLE "Availability";

-- CreateTable
CREATE TABLE "RecurringAvailability" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "dayOfWeek" "Day" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomAvailability" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "overrideType" "OverrideType" NOT NULL DEFAULT 'MODIFIED',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringAvailability_doctorId_idx" ON "RecurringAvailability"("doctorId");

-- CreateIndex
CREATE INDEX "RecurringAvailability_dayOfWeek_idx" ON "RecurringAvailability"("dayOfWeek");

-- CreateIndex
CREATE INDEX "CustomAvailability_doctorId_idx" ON "CustomAvailability"("doctorId");

-- CreateIndex
CREATE INDEX "CustomAvailability_date_idx" ON "CustomAvailability"("date");

-- AddForeignKey
ALTER TABLE "RecurringAvailability" ADD CONSTRAINT "RecurringAvailability_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAvailability" ADD CONSTRAINT "CustomAvailability_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
