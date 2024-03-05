/*
  Warnings:

  - You are about to drop the `Babyfoot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Parties` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Utilisateurs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `Parties` DROP FOREIGN KEY `Parties_adversaire_1Id_fkey`;

-- DropForeignKey
ALTER TABLE `Parties` DROP FOREIGN KEY `Parties_adversaire_2Id_fkey`;

-- DropForeignKey
ALTER TABLE `Parties` DROP FOREIGN KEY `Parties_babyfootId_fkey`;

-- DropTable
DROP TABLE `Babyfoot`;

-- DropTable
DROP TABLE `Parties`;

-- DropTable
DROP TABLE `Utilisateurs`;

-- CreateTable
CREATE TABLE `Staff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `mail` VARCHAR(255) NOT NULL,
    `pwd` VARCHAR(255) NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'user',
    `pwdtoken` VARCHAR(20) NOT NULL DEFAULT '0',
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approved` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `Staff_name_key`(`name`),
    UNIQUE INDEX `Staff_mail_key`(`mail`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `surname` VARCHAR(255) NOT NULL,
    `mail` VARCHAR(255) NOT NULL,
    `usertypeId` INTEGER NOT NULL,
    `accountCreationDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `birthYear` INTEGER NOT NULL,
    `comment` VARCHAR(255) NOT NULL,
    `termsAndConditions` BOOLEAN NOT NULL DEFAULT false,
    `token` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `Users_mail_key`(`mail`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Usertype` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `Usertype_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Users` ADD CONSTRAINT `Users_usertypeId_fkey` FOREIGN KEY (`usertypeId`) REFERENCES `Usertype`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
