/*
  Warnings:

  - Added the required column `mail` to the `Utilisateurs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pwd` to the `Utilisateurs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Utilisateurs` ADD COLUMN `mail` VARCHAR(255) NOT NULL,
    ADD COLUMN `pwd` VARCHAR(255) NOT NULL;
