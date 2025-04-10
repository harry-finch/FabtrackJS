-- Drop old tables if they exist
DROP TABLE IF EXISTS `Parties`;
DROP TABLE IF EXISTS `Babyfoot`;
DROP TABLE IF EXISTS `Utilisateurs`;

-- CreateTable for core user management
CREATE TABLE `Staff` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(20) NOT NULL DEFAULT 'user',
  `pwdToken` VARCHAR(40) NULL,
  `tokenExpiry` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `approved` BOOLEAN NOT NULL DEFAULT false,

  UNIQUE INDEX `Staff_name_key`(`name`),
  UNIQUE INDEX `Staff_email_key`(`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for tracked users (visitors, students, etc)
CREATE TABLE `User` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `surname` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `usertypeId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NULL,
  `birthYear` INTEGER NULL,
  `comment` VARCHAR(255) NULL,
  `balance` DECIMAL(65,30) NOT NULL DEFAULT 0.0,
  `termsAccepted` BOOLEAN NOT NULL DEFAULT false,
  `token` VARCHAR(40) NOT NULL,
  `deletedAt` DATETIME(3) NULL,

  UNIQUE INDEX `User_email_key`(`email`),
  UNIQUE INDEX `User_token_key`(`token`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for user types
CREATE TABLE `Usertype` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,

  UNIQUE INDEX `Usertype_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for projects
CREATE TABLE `Project` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `url` VARCHAR(255) NOT NULL,
  `projecttypeId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `active` BOOLEAN NOT NULL DEFAULT true,

  UNIQUE INDEX `Project_url_key`(`url`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for project types
CREATE TABLE `Projecttype` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,

  UNIQUE INDEX `Projecttype_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for many-to-many relationship between users and projects
CREATE TABLE `UserProject` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `projectId` INTEGER NOT NULL,

  UNIQUE INDEX `UserProject_userId_projectId_key`(`userId`, `projectId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for warnings
CREATE TABLE `Warning` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `warningtypeId` INTEGER NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `comments` VARCHAR(255) NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for warning types
CREATE TABLE `Warningtype` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `icon` VARCHAR(255) NULL,

  UNIQUE INDEX `Warningtype_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for history of user visits
CREATE TABLE `History` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `arrival` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `departure` DATETIME(3) NULL,
  `userId` INTEGER NOT NULL,
  `userprojectId` INTEGER NULL,
  `comments` VARCHAR(255) NULL,
  `workspaceId` INTEGER NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for workspaces
CREATE TABLE `Workspace` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `location` VARCHAR(255) NULL,

  UNIQUE INDEX `Workspace_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for activity tracking
CREATE TABLE `Activity` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resourceId` INTEGER NOT NULL,
  `resourceType` ENUM('MACHINE', 'EQUIPMENT', 'CONSUMABLE') NOT NULL,
  `quantity` INTEGER NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for categories
CREATE TABLE `Category` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `workspaceId` INTEGER NOT NULL,

  UNIQUE INDEX `Category_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for machines
CREATE TABLE `Machine` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `machinetypeId` INTEGER NOT NULL,
  `make` VARCHAR(255) NOT NULL,
  `model` VARCHAR(255) NOT NULL,
  `serialNumber` VARCHAR(255) NULL,
  `internalReference` INTEGER NULL,
  `locationId` INTEGER NULL,
  `purchaseDate` DATETIME(3) NULL,
  `lastMaintenance` DATETIME(3) NULL,
  `warrantyExpiry` DATETIME(3) NULL,
  `picture` VARCHAR(255) NULL,
  `documentation` VARCHAR(255) NULL,
  `accessId` INTEGER NOT NULL,

  UNIQUE INDEX `Machine_serialNumber_key`(`serialNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for machine types
CREATE TABLE `MachineType` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for equipment
CREATE TABLE `Equipment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,

  UNIQUE INDEX `Equipment_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for consumables
CREATE TABLE `Consumable` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `cost` DECIMAL(65,30) NOT NULL,
  `stock` INTEGER NOT NULL DEFAULT 0,
  `reorderThreshold` INTEGER NOT NULL DEFAULT 10,
  `status` ENUM('AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK') NOT NULL DEFAULT 'AVAILABLE',

  UNIQUE INDEX `Consumable_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for locations
CREATE TABLE `Location` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `description` VARCHAR(255) NULL,

  UNIQUE INDEX `Location_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for access requirements
CREATE TABLE `Access` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `description` VARCHAR(255) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable for logging
CREATE TABLE `Log` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `description` VARCHAR(255) NOT NULL,
  `userId` INTEGER NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey constraints
ALTER TABLE `User` ADD CONSTRAINT `User_usertypeId_fkey` FOREIGN KEY (`usertypeId`) REFERENCES `Usertype`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Project` ADD CONSTRAINT `Project_projecttypeId_fkey` FOREIGN KEY (`projecttypeId`) REFERENCES `Projecttype`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UserProject` ADD CONSTRAINT `UserProject_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserProject` ADD CONSTRAINT `UserProject_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Warning` ADD CONSTRAINT `Warning_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Warning` ADD CONSTRAINT `Warning_warningtypeId_fkey` FOREIGN KEY (`warningtypeId`) REFERENCES `Warningtype`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `History` ADD CONSTRAINT `History_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `History` ADD CONSTRAINT `History_userprojectId_fkey` FOREIGN KEY (`userprojectId`) REFERENCES `UserProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `History` ADD CONSTRAINT `History_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Category` ADD CONSTRAINT `Category_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Machine` ADD CONSTRAINT `Machine_machinetypeId_fkey` FOREIGN KEY (`machinetypeId`) REFERENCES `MachineType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Machine` ADD CONSTRAINT `Machine_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Machine` ADD CONSTRAINT `Machine_accessId_fkey` FOREIGN KEY (`accessId`) REFERENCES `Access`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Log` ADD CONSTRAINT `Log_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;