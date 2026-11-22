-- Migration 002 (R-014): Persistent Session table & critical composite indexes
CREATE TABLE IF NOT EXISTS `Session` (
  `sid` VARCHAR(128) NOT NULL,
  `data` LONGTEXT NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`sid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS `Session_expiresAt_idx` ON `Session`(`expiresAt`);
CREATE INDEX IF NOT EXISTS `History_workspaceId_departure_arrival_idx` ON `History`(`workspaceId`, `departure`, `arrival`);
CREATE INDEX IF NOT EXISTS `History_userId_departure_arrival_idx` ON `History`(`userId`, `departure`, `arrival`);
CREATE INDEX IF NOT EXISTS `History_arrival_idx` ON `History`(`arrival`);
CREATE INDEX IF NOT EXISTS `Activity_resourceType_returnedAt_userId_idx` ON `Activity`(`resourceType`, `returnedAt`, `userId`);
CREATE INDEX IF NOT EXISTS `Activity_resourceType_resourceId_endedAt_idx` ON `Activity`(`resourceType`, `resourceId`, `endedAt`);
CREATE INDEX IF NOT EXISTS `Activity_createdAt_idx` ON `Activity`(`createdAt`);
CREATE INDEX IF NOT EXISTS `Warning_userId_active_idx` ON `Warning`(`userId`, `active`);
CREATE INDEX IF NOT EXISTS `MachineIssue_machineId_status_createdAt_idx` ON `MachineIssue`(`machineId`, `status`, `createdAt`);
CREATE INDEX IF NOT EXISTS `MachineMaintenance_machineId_maintenanceDate_idx` ON `MachineMaintenance`(`machineId`, `maintenanceDate`);
CREATE INDEX IF NOT EXISTS `Log_timestamp_idx` ON `Log`(`timestamp`);
