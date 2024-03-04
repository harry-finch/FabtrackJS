/*
  Warnings:

  - A unique constraint covering the columns `[babyfootId]` on the table `Parties` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Parties_babyfootId_key` ON `Parties`(`babyfootId`);

-- AddForeignKey
ALTER TABLE `Parties` ADD CONSTRAINT `Parties_babyfootId_fkey` FOREIGN KEY (`babyfootId`) REFERENCES `Babyfoot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
