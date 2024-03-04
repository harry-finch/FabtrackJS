/*
  Warnings:

  - A unique constraint covering the columns `[mail]` on the table `Utilisateurs` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Utilisateurs_mail_key` ON `Utilisateurs`(`mail`);
