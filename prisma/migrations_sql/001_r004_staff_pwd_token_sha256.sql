-- Migration 001 (R-004): Extend Staff.pwdToken to store 64-char SHA-256 hashes
ALTER TABLE `Staff` MODIFY COLUMN `pwdToken` VARCHAR(64) NULL;
