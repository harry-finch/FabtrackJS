-- ==============================================================================
-- FabtrackJS - Script de migration SQL (Dernières évolutions)
-- Compatible MySQL 5.7+, MySQL 8.0+, MariaDB 10.x+
-- Idempotent : peut être réexécuté sans écraser ni générer d'erreurs
-- ==============================================================================

-- 1. Table des mouvements d'inventaire (sorties, casses, rebuts, maintenance)
CREATE TABLE IF NOT EXISTS `InventoryMovement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `itemType` ENUM('CONSUMABLE', 'EQUIPMENT') NOT NULL,
    `itemId` INTEGER NOT NULL,
    `itemName` VARCHAR(255) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit` VARCHAR(30) NULL,
    `reason` VARCHAR(100) NOT NULL,
    `notes` TEXT NULL,
    `author` VARCHAR(255) NOT NULL,
    `stockBefore` INTEGER NULL,
    `stockAfter` INTEGER NULL,
    `equipmentStatusBefore` VARCHAR(50) NULL,
    `equipmentStatusAfter` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Table des opérations de maintenance sur les machines
CREATE TABLE IF NOT EXISTS `MachineMaintenance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `machineId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `maintenanceDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `title` VARCHAR(255) NOT NULL,
    `type` VARCHAR(50) NOT NULL DEFAULT 'PREVENTIVE',
    `description` TEXT NULL,
    `operator` VARCHAR(255) NOT NULL,
    `partsReplaced` VARCHAR(255) NULL,
    `cost` DECIMAL(10, 2) NULL,

    PRIMARY KEY (`id`),
    CONSTRAINT `MachineMaintenance_machineId_fkey` FOREIGN KEY (`machineId`) REFERENCES `Machine`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. Ajout sécurisé et idempotent des colonnes sur la table Equipment
DROP PROCEDURE IF EXISTS AddEquipmentColumnsSafely;
DELIMITER $$
CREATE PROCEDURE AddEquipmentColumnsSafely()
BEGIN
    -- status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'Equipment' 
          AND COLUMN_NAME = 'status'
    ) THEN
        ALTER TABLE `Equipment` ADD COLUMN `status` VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE';
    END IF;

    -- decommissionedAt
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'Equipment' 
          AND COLUMN_NAME = 'decommissionedAt'
    ) THEN
        ALTER TABLE `Equipment` ADD COLUMN `decommissionedAt` DATETIME(3) NULL;
    END IF;

    -- decommissionReason
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'Equipment' 
          AND COLUMN_NAME = 'decommissionReason'
    ) THEN
        ALTER TABLE `Equipment` ADD COLUMN `decommissionReason` VARCHAR(255) NULL;
    END IF;
END$$
DELIMITER ;

CALL AddEquipmentColumnsSafely();
DROP PROCEDURE IF EXISTS AddEquipmentColumnsSafely;

-- ==============================================================================
-- Fin de migration
-- ==============================================================================
