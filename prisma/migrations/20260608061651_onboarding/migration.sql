/*
  Warnings:

  - You are about to drop the column `scheduledDay` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `Availability` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `Availability` table. All the data in the column will be lost.
  - You are about to drop the column `speciality` on the `Doctor` table. All the data in the column will be lost.
  - You are about to drop the column `admittedAt` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `dischargeAt` on the `Patient` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[patientId,doctorId,startTime,endTime]` on the table `Appointment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[doctorId,dayOfWeek,startHour,endHour]` on the table `Availability` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[pid]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `endHour` to the `Availability` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startHour` to the `Availability` table without a default value. This is not possible if the table is not empty.
  - Added the required column `consultationFee` to the `Doctor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `qualification` to the `Doctor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `specialization` to the `Doctor` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Availability" DROP CONSTRAINT "Availability_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "Doctor" DROP CONSTRAINT "Doctor_userId_fkey";

-- DropForeignKey
ALTER TABLE "Patient" DROP CONSTRAINT "Patient_userId_fkey";

-- DropIndex
DROP INDEX "Appointment_patientId_doctorId_scheduledDay_startTime_endTi_key";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "scheduledDay";

-- AlterTable
ALTER TABLE "Availability" DROP COLUMN "endTime",
DROP COLUMN "startTime",
ADD COLUMN     "endHour" INTEGER NOT NULL,
ADD COLUMN     "startHour" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Doctor" DROP COLUMN "speciality",
ADD COLUMN     "consultationFee" INTEGER NOT NULL,
ADD COLUMN     "profileDetails" TEXT,
ADD COLUMN     "qualification" TEXT NOT NULL,
ADD COLUMN     "specialization" TEXT NOT NULL,
ALTER COLUMN "activeStatus" SET DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "admittedAt",
DROP COLUMN "dischargeAt",
ALTER COLUMN "bloodGroup" DROP NOT NULL,
ALTER COLUMN "pastIllness" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_patientId_doctorId_startTime_endTime_key" ON "Appointment"("patientId", "doctorId", "startTime", "endTime");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_doctorId_dayOfWeek_startHour_endHour_key" ON "Availability"("doctorId", "dayOfWeek", "startHour", "endHour");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_pid_key" ON "Patient"("pid");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
