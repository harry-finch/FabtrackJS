/*
  Warnings:

  - A unique constraint covering the columns `[nom]` on the table `Utilisateurs` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Utilisateurs_nom_key` ON `Utilisateurs`(`nom`);
