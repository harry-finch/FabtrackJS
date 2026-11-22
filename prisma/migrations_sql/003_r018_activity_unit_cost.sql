-- Migration 003 (R-018): Historical unitCost snapshot on Activity
ALTER TABLE `Activity` ADD COLUMN IF NOT EXISTS `unitCost` DECIMAL(10, 2) NULL;
