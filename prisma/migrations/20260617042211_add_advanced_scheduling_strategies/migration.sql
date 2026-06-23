/*
  Warnings:

  - You are about to drop the `Availability` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "OverrideType" AS ENUM ('MODIFIED', 'UNAVAILABLE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SchedulingType" AS ENUM ('STREAM', 'WAVE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- DropForeignKey
DO $$ BEGIN
    ALTER TABLE "Availability" DROP CONSTRAINT "Availability_doctorId_fkey";
EXCEPTION
    WHEN undefined_table THEN null;
    WHEN undefined_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "tokenNumber" INTEGER;

-- AlterTable
ALTER TABLE "Doctor" 
    ADD COLUMN IF NOT EXISTS "bufferTime" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "maxWaveCapacity" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS "schedulingType" "SchedulingType" NOT NULL DEFAULT 'STREAM',
    ADD COLUMN IF NOT EXISTS "slotDuration" INTEGER NOT NULL DEFAULT 15;

-- DropTable
DROP TABLE IF EXISTS "Availability";

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecurringAvailability" (
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
CREATE TABLE IF NOT EXISTS "CustomAvailability" (
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
CREATE INDEX IF NOT EXISTS "RecurringAvailability_doctorId_idx" ON "RecurringAvailability"("doctorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecurringAvailability_dayOfWeek_idx" ON "RecurringAvailability"("dayOfWeek");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomAvailability_doctorId_idx" ON "CustomAvailability"("doctorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomAvailability_date_idx" ON "CustomAvailability"("date");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "RecurringAvailability" ADD CONSTRAINT "RecurringAvailability_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "CustomAvailability" ADD CONSTRAINT "CustomAvailability_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;