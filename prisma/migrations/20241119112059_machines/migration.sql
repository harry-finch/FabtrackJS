/*
  Warnings:

  - Added the required column `accessId` to the `Machine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `machinetypeId` to the `Machine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `make` to the `Machine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model` to the `Machine` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Machine` ADD COLUMN `accessId` INTEGER NOT NULL,
    ADD COLUMN `internalReference` INTEGER NULL,
    ADD COLUMN `machinetypeId` INTEGER NOT NULL,
    ADD COLUMN `make` VARCHAR(255) NOT NULL,
    ADD COLUMN `model` VARCHAR(255) NOT NULL,
    ADD COLUMN `picture` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `MachineType` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Machine` ADD CONSTRAINT `Machine_machinetypeId_fkey` FOREIGN KEY (`machinetypeId`) REFERENCES `MachineType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Machine` ADD CONSTRAINT `Machine_accessId_fkey` FOREIGN KEY (`accessId`) REFERENCES `Access`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
