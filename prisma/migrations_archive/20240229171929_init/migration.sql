/*
  Warnings:

  - Added the required column `etat` to the `Parties` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Parties` ADD COLUMN `etat` VARCHAR(10) NOT NULL;
