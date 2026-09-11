/*
  Warnings:

  - You are about to drop the column `projectId` on the `History` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `History` DROP FOREIGN KEY `History_projectId_fkey`;

-- AlterTable
ALTER TABLE `History` DROP COLUMN `projectId`,
    ADD COLUMN `userprojectId` INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE `History` ADD CONSTRAINT `History_userprojectId_fkey` FOREIGN KEY (`userprojectId`) REFERENCES `Userproject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
