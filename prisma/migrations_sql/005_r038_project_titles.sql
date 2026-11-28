-- Migration 005: R-038 Project custom local titles & cached BookStack wiki titles
-- Adds customTitle (user-defined local name in Fabtrack) and wikiTitle (last known BookStack title)

ALTER TABLE `Project` ADD COLUMN IF NOT EXISTS `customTitle` VARCHAR(255) NULL;
ALTER TABLE `Project` ADD COLUMN IF NOT EXISTS `wikiTitle` VARCHAR(255) NULL;
