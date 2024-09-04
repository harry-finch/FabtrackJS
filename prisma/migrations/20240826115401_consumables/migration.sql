/*
  Warnings:

  - You are about to drop the `Consummable` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `Activity` DROP FOREIGN KEY `Activity_consummableId_fkey`;

-- DropTable
DROP TABLE `Consummable`;

-- CreateTable
CREATE TABLE `Consumable` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `cost` DOUBLE NOT NULL,

    UNIQUE INDEX `Consumable_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_consummableId_fkey` FOREIGN KEY (`consummableId`) REFERENCES `Consumable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
