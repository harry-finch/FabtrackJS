/*
  Warnings:

  - You are about to drop the column `consummableId` on the `Activity` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `Activity` DROP FOREIGN KEY `Activity_consummableId_fkey`;

-- AlterTable
ALTER TABLE `Activity` DROP COLUMN `consummableId`,
    ADD COLUMN `consumableId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_consumableId_fkey` FOREIGN KEY (`consumableId`) REFERENCES `Consumable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
