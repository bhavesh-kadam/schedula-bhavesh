/*
  Warnings:

  - A unique constraint covering the columns `[doctorId,dayOfWeek]` on the table `Availability` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Availability_doctorId_dayOfWeek_key" ON "Availability"("doctorId", "dayOfWeek");
