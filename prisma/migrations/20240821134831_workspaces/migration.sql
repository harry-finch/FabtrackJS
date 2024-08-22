-- AlterTable
ALTER TABLE `History` ADD COLUMN `workspaceId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `projectCreationDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateTable
CREATE TABLE `Workspace` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `location` VARCHAR(255) NULL,

    UNIQUE INDEX `Workspace_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `History` ADD CONSTRAINT `History_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
