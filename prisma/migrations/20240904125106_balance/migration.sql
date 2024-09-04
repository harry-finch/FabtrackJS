/*
  Warnings:

  - You are about to drop the column `debt` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `User` DROP COLUMN `debt`,
    ADD COLUMN `balance` DOUBLE NOT NULL DEFAULT 0.0;
