-- Migration 000 (v1.0 / R-003): Machine usage session & 3D printing columns on Activity
-- Ensures upgrades from pre-v1.0 databases have all Activity columns before 002 creates indexes on endedAt.
ALTER TABLE `Activity` ADD COLUMN IF NOT EXISTS `startedAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE `Activity` ADD COLUMN IF NOT EXISTS `endedAt` DATETIME(3) NULL;
ALTER TABLE `Activity` ADD COLUMN IF NOT EXISTS `gcodeName` VARCHAR(255) NULL;
ALTER TABLE `Activity` ADD COLUMN IF NOT EXISTS `filamentQuantity` DECIMAL(10, 2) NULL;
ALTER TABLE `Activity` ADD COLUMN IF NOT EXISTS `filamentType` VARCHAR(100) NULL;
ALTER TABLE `Activity` ADD COLUMN IF NOT EXISTS `printDuration` INTEGER NULL;
ALTER TABLE `Activity` ADD COLUMN IF NOT EXISTS `comments` VARCHAR(255) NULL;
