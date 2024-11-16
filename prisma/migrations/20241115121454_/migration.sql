/*
  Warnings:

  - You are about to drop the column `consumableId` on the `Activity` table. All the data in the column will be lost.
  - You are about to drop the column `equipmentId` on the `Activity` table. All the data in the column will be lost.
  - You are about to drop the column `historyId` on the `Activity` table. All the data in the column will be lost.
  - You are about to drop the column `machineId` on the `Activity` table. All the data in the column will be lost.
  - You are about to drop the column `projectCreationDate` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `mail` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `pwd` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `pwdtoken` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `accountCreationDate` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `comment` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `mail` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `termsAndConditions` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Machinetype` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Userproject` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[serialNumber]` on the table `Machine` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `Staff` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `Warningtype` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `resourceId` to the `Activity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `resourceType` to the `Activity` table without a default value. This is not possible if the table is not empty.
  - Made the column `name` on table `Machine` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `email` to the `Staff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `Staff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `email` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `Activity` DROP FOREIGN KEY `Activity_consumableId_fkey`;

-- DropForeignKey
ALTER TABLE `Activity` DROP FOREIGN KEY `Activity_equipmentId_fkey`;

-- DropForeignKey
ALTER TABLE `Activity` DROP FOREIGN KEY `Activity_machineId_fkey`;

-- DropForeignKey
ALTER TABLE `History` DROP FOREIGN KEY `History_userprojectId_fkey`;

-- DropForeignKey
ALTER TABLE `Userproject` DROP FOREIGN KEY `Userproject_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `Userproject` DROP FOREIGN KEY `Userproject_userId_fkey`;

-- DropIndex
DROP INDEX `Staff_mail_key` ON `Staff`;

-- DropIndex
DROP INDEX `User_mail_key` ON `User`;

-- DropIndex
DROP INDEX `User_name_surname_key` ON `User`;

-- AlterTable
ALTER TABLE `Activity` DROP COLUMN `consumableId`,
    DROP COLUMN `equipmentId`,
    DROP COLUMN `historyId`,
    DROP COLUMN `machineId`,
    ADD COLUMN `resourceId` INTEGER NOT NULL,
    ADD COLUMN `resourceType` ENUM('MACHINE', 'EQUIPMENT', 'CONSUMABLE') NOT NULL;

-- AlterTable
ALTER TABLE `Consumable` ADD COLUMN `reorderThreshold` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `status` ENUM('AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK') NOT NULL DEFAULT 'AVAILABLE',
    ADD COLUMN `stock` INTEGER NOT NULL DEFAULT 0,
    MODIFY `cost` DECIMAL(65, 30) NOT NULL;

-- AlterTable
ALTER TABLE `History` MODIFY `comments` VARCHAR(255) NULL,
    MODIFY `userprojectId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Log` ADD COLUMN `userId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Machine` ADD COLUMN `documentation` VARCHAR(255) NULL,
    ADD COLUMN `lastMaintenance` DATETIME(3) NULL,
    ADD COLUMN `locationId` INTEGER NULL,
    ADD COLUMN `purchaseDate` DATETIME(3) NULL,
    ADD COLUMN `serialNumber` VARCHAR(255) NULL,
    ADD COLUMN `warrantyExpiry` DATETIME(3) NULL,
    MODIFY `name` VARCHAR(255) NOT NULL;

-- AlterTable
ALTER TABLE `Project` DROP COLUMN `projectCreationDate`,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Staff` DROP COLUMN `mail`,
    DROP COLUMN `pwd`,
    DROP COLUMN `pwdtoken`,
    DROP COLUMN `timestamp`,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `email` VARCHAR(255) NOT NULL,
    ADD COLUMN `password` VARCHAR(255) NOT NULL,
    ADD COLUMN `pwdToken` VARCHAR(20) NULL,
    ADD COLUMN `tokenExpiry` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `accountCreationDate`,
    DROP COLUMN `comment`,
    DROP COLUMN `mail`,
    DROP COLUMN `termsAndConditions`,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `email` VARCHAR(255) NOT NULL,
    ADD COLUMN `termsAccepted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `updatedAt` DATETIME(3) NULL,
    MODIFY `token` VARCHAR(40) NOT NULL,
    MODIFY `balance` DECIMAL(65, 30) NOT NULL DEFAULT 0.0;

-- AlterTable
ALTER TABLE `Warning` MODIFY `comments` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `Warningtype` MODIFY `icon` VARCHAR(255) NULL;

-- DropTable
DROP TABLE `Machinetype`;

-- DropTable
DROP TABLE `Userproject`;

-- CreateTable
CREATE TABLE `UserProject` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `projectId` INTEGER NOT NULL,

    UNIQUE INDEX `UserProject_userId_projectId_key`(`userId`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Machine_serialNumber_key` ON `Machine`(`serialNumber`);

-- CreateIndex
CREATE UNIQUE INDEX `Staff_email_key` ON `Staff`(`email`);

-- CreateIndex
CREATE UNIQUE INDEX `User_email_key` ON `User`(`email`);

-- CreateIndex
CREATE UNIQUE INDEX `Warningtype_name_key` ON `Warningtype`(`name`);

-- AddForeignKey
ALTER TABLE `Log` ADD CONSTRAINT `Log_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProject` ADD CONSTRAINT `UserProject_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProject` ADD CONSTRAINT `UserProject_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `History` ADD CONSTRAINT `History_userprojectId_fkey` FOREIGN KEY (`userprojectId`) REFERENCES `UserProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `FK_Activity_Machine` FOREIGN KEY (`resourceId`) REFERENCES `Machine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `FK_Activity_Equipment` FOREIGN KEY (`resourceId`) REFERENCES `Equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `FK_Activity_Consumable` FOREIGN KEY (`resourceId`) REFERENCES `Consumable`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Machine` ADD CONSTRAINT `Machine_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
