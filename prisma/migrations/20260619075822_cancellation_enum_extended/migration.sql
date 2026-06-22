/*
  Warnings:

  - The values [CANCELLED] on the enum `AppointmentStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'CANCELLED_BY_PATIENT';
ALTER TYPE "AppointmentStatus" ADD VALUE 'CANCELLED_BY_DOCTOR';