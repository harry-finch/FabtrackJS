/*
  Warnings:

  - A unique constraint covering the columns `[name,surname]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `History` MODIFY `departure` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Location` MODIFY `description` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `Machine` MODIFY `internalReference` INTEGER NULL,
    MODIFY `picture` VARCHAR(255) NULL,
    MODIFY `documentation` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `User` MODIFY `birthYear` INTEGER NULL,
    MODIFY `comment` VARCHAR(255) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_name_surname_key` ON `User`(`name`, `surname`);
