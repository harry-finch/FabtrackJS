-- Migration 006: R-037 Link staff accounts (admin/user) to a contributor profile (User)
-- Adds civil profile fields collected from the staff member and optional 1-to-1 FK Staff.userId -> User.id

ALTER TABLE `Staff` ADD COLUMN IF NOT EXISTS `firstName` VARCHAR(255) NULL;
ALTER TABLE `Staff` ADD COLUMN IF NOT EXISTS `lastName` VARCHAR(255) NULL;
ALTER TABLE `Staff` ADD COLUMN IF NOT EXISTS `usertypeId` INTEGER NULL;
ALTER TABLE `Staff` ADD COLUMN IF NOT EXISTS `userId` INTEGER NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `Staff_userId_key` ON `Staff`(`userId`);

ALTER TABLE `Staff` ADD CONSTRAINT IF NOT EXISTS `Staff_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
