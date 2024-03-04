-- CreateTable
CREATE TABLE `Utilisateurs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nom` VARCHAR(255) NOT NULL,
    `role` VARCHAR(20) NOT NULL,
    `victoires` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Babyfoot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `localisation` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Parties` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `babyfootId` INTEGER NOT NULL,
    `adversaire_1` INTEGER NOT NULL,
    `score_1` INTEGER NOT NULL,
    `adversaire_2` INTEGER NOT NULL,
    `score_2` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
