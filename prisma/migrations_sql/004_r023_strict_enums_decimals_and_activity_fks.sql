-- Migration 004 (R-023): Strict enums, explicit decimals, Log.description TEXT, and nullable typed FKs on Activity

-- 1. Normalize any unexpected legacy values before converting VARCHAR columns to ENUM
UPDATE `Staff` SET `role` = 'user' WHERE `role` IS NULL OR `role` NOT IN ('admin', 'user', 'staff');
UPDATE `Equipment` SET `status` = 'AVAILABLE' WHERE `status` IS NULL OR `status` NOT IN ('AVAILABLE', 'OUT_OF_SERVICE', 'DECOMMISSIONED');
UPDATE `MachineIssue` SET `status` = 'OPEN' WHERE `status` IS NULL OR `status` NOT IN ('OPEN', 'RESOLVED');
UPDATE `History` SET `repairStatus` = NULL WHERE `repairStatus` IS NOT NULL AND `repairStatus` NOT IN ('PENDING', 'REPAIRED', 'PARTIALLY_REPAIRED', 'NOT_REPAIRED', 'NEEDS_RETURN');

-- 2. Apply strict ENUM types
ALTER TABLE `Staff` MODIFY COLUMN `role` ENUM('admin', 'user', 'staff') NOT NULL DEFAULT 'user';
ALTER TABLE `Equipment` MODIFY COLUMN `status` ENUM('AVAILABLE', 'OUT_OF_SERVICE', 'DECOMMISSIONED') NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE `MachineIssue` MODIFY COLUMN `status` ENUM('OPEN', 'RESOLVED') NOT NULL DEFAULT 'OPEN';
ALTER TABLE `History` MODIFY COLUMN `repairStatus` ENUM('PENDING', 'REPAIRED', 'PARTIALLY_REPAIRED', 'NOT_REPAIRED', 'NEEDS_RETURN') NULL;

-- 3. Explicit decimal precision & TEXT audit log description
ALTER TABLE `Log` MODIFY COLUMN `description` TEXT NOT NULL;
ALTER TABLE `User` MODIFY COLUMN `balance` DECIMAL(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE `Consumable` MODIFY COLUMN `cost` DECIMAL(10, 2) NOT NULL;

-- 4. Prepare transition from polymorphic Activity(resourceType, resourceId) to typed nullable FKs (zero data loss)
ALTER TABLE `Activity` ADD COLUMN IF NOT EXISTS `machineId` INTEGER NULL;
ALTER TABLE `Activity` ADD COLUMN IF NOT EXISTS `consumableId` INTEGER NULL;
ALTER TABLE `Activity` ADD COLUMN IF NOT EXISTS `equipmentId` INTEGER NULL;

CREATE INDEX IF NOT EXISTS `Activity_machineId_idx` ON `Activity`(`machineId`);
CREATE INDEX IF NOT EXISTS `Activity_consumableId_idx` ON `Activity`(`consumableId`);
CREATE INDEX IF NOT EXISTS `Activity_equipmentId_idx` ON `Activity`(`equipmentId`);

-- 5. Backfill typed FKs safely (only for valid existing target rows so orphans never break FK constraints)
UPDATE `Activity` a
  INNER JOIN `Machine` m ON m.`id` = a.`resourceId`
  SET a.`machineId` = a.`resourceId`
  WHERE a.`resourceType` = 'MACHINE' AND a.`machineId` IS NULL;

UPDATE `Activity` a
  INNER JOIN `Consumable` c ON c.`id` = a.`resourceId`
  SET a.`consumableId` = a.`resourceId`
  WHERE a.`resourceType` = 'CONSUMABLE' AND a.`consumableId` IS NULL;

UPDATE `Activity` a
  INNER JOIN `Equipment` e ON e.`id` = a.`resourceId`
  SET a.`equipmentId` = a.`resourceId`
  WHERE a.`resourceType` = 'EQUIPMENT' AND a.`equipmentId` IS NULL;

-- 6. Add nullable foreign key constraints (ON DELETE SET NULL preserves historical billing/usage logs)
ALTER TABLE `Activity` ADD CONSTRAINT IF NOT EXISTS `Activity_machineId_fkey` FOREIGN KEY (`machineId`) REFERENCES `Machine`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Activity` ADD CONSTRAINT IF NOT EXISTS `Activity_consumableId_fkey` FOREIGN KEY (`consumableId`) REFERENCES `Consumable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Activity` ADD CONSTRAINT IF NOT EXISTS `Activity_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
