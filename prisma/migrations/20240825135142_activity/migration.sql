/*
  Warnings:

  - You are about to drop the column `accessId` on the `Machine` table. All the data in the column will be lost.
  - You are about to drop the column `documentation` on the `Machine` table. All the data in the column will be lost.
  - You are about to drop the column `internalReference` on the `Machine` table. All the data in the column will be lost.
  - You are about to drop the column `locationId` on the `Machine` table. All the data in the column will be lost.
  - You are about to drop the column `machinetypeId` on the `Machine` table. All the data in the column will be lost.
  - You are about to drop the column `make` on the `Machine` table. All the data in the column will be lost.
  - You are about to drop the column `model` on the `Machine` table. All the data in the column will be lost.
  - You are about to drop the column `picture` on the `Machine` table. All the data in the column will be lost.
  - You are about to drop the column `serialnum` on the `Machine` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `Machine` DROP FOREIGN KEY `Machine_accessId_fkey`;

-- DropForeignKey
ALTER TABLE `Machine` DROP FOREIGN KEY `Machine_locationId_fkey`;

-- DropForeignKey
ALTER TABLE `Machine` DROP FOREIGN KEY `Machine_machinetypeId_fkey`;

-- AlterTable
ALTER TABLE `Machine` DROP COLUMN `accessId`,
    DROP COLUMN `documentation`,
    DROP COLUMN `internalReference`,
    DROP COLUMN `locationId`,
    DROP COLUMN `machinetypeId`,
    DROP COLUMN `make`,
    DROP COLUMN `model`,
    DROP COLUMN `picture`,
    DROP COLUMN `serialnum`,
    ADD COLUMN `name` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `Activity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `historyId` INTEGER NOT NULL,
    `machineId` INTEGER NULL,
    `equipmentId` INTEGER NULL,
    `consummableId` INTEGER NULL,
    `quantity` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Equipment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `Equipment_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Consummable` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `Consummable_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_machineId_fkey` FOREIGN KEY (`machineId`) REFERENCES `Machine`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_consummableId_fkey` FOREIGN KEY (`consummableId`) REFERENCES `Consummable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
