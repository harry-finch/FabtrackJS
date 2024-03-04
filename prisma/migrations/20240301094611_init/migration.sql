/*
  Warnings:

  - You are about to drop the column `adversaire_1` on the `Parties` table. All the data in the column will be lost.
  - You are about to drop the column `adversaire_2` on the `Parties` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[adversaire_1Id]` on the table `Parties` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[adversaire_2Id]` on the table `Parties` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `adversaire_1Id` to the `Parties` table without a default value. This is not possible if the table is not empty.
  - Added the required column `adversaire_2Id` to the `Parties` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Parties` DROP COLUMN `adversaire_1`,
    DROP COLUMN `adversaire_2`,
    ADD COLUMN `adversaire_1Id` INTEGER NOT NULL,
    ADD COLUMN `adversaire_2Id` INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Parties_adversaire_1Id_key` ON `Parties`(`adversaire_1Id`);

-- CreateIndex
CREATE UNIQUE INDEX `Parties_adversaire_2Id_key` ON `Parties`(`adversaire_2Id`);

-- AddForeignKey
ALTER TABLE `Parties` ADD CONSTRAINT `Parties_adversaire_1Id_fkey` FOREIGN KEY (`adversaire_1Id`) REFERENCES `Utilisateurs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Parties` ADD CONSTRAINT `Parties_adversaire_2Id_fkey` FOREIGN KEY (`adversaire_2Id`) REFERENCES `Utilisateurs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
