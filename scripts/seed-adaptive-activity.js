/**
 * scripts/seed-adaptive-activity.js
 * 
 * Générateur d'historique d'activité intelligent et adaptatif pour FabtrackJS.
 * 
 * Fonctionnalités :
 * 1. Introspection automatique : S'adapte dynamiquement à tout ce qui est déjà saisi
 *    dans la base de données (usertypes, projecttypes, warningtypes, machines,
 *    consommables, espaces de travail, unités d'enseignement).
 * 2. Génération réaliste : Visites (History), utilisation de machines (Activity),
 *    consommation de matières (Activity), et avertissements occasionnels (Warning).
 * 3. Distribution temporelle naturelle : Rythme hebdomadaire (jours ouvrés, pics milieu
 *    de semaine, fermeture le dimanche), durées de visites réalistes, horodatages cohérents.
 * 4. Période glissante : Génère sur les N derniers mois/jours jusqu'à la date d'aujourd'hui.
 * 5. Compatible 100% multi-plateforme (MariaDB Driver Adapter via utilities/db.js).
 * 
 * Usage :
 *   node scripts/seed-adaptive-activity.js
 *   node scripts/seed-adaptive-activity.js --days=60
 *   node scripts/seed-adaptive-activity.js --months=6
 *   node scripts/seed-adaptive-activity.js --users=30
 *   node scripts/seed-adaptive-activity.js --clean
 */

const { prisma } = require("../utilities/db");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

// --- Utilitaires de hasard ---
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomChance(percentage) {
  return Math.random() * 100 < percentage;
}

// --- Banques de données pour complétion si nécessaire ---
const SAMPLE_FIRSTNAMES = [
  "Alexandre", "Camille", "Thomas", "Sophie", "Lucas", "Léa", "Nicolas", "Emma",
  "Julien", "Chloé", "Maxime", "Manon", "Antoine", "Inès", "Guillaume", "Sarah",
  "Clément", "Julie", "Romain", "Clara", "Hugo", "Lucie", "Paul", "Laura",
  "Théo", "Marie", "Adrien", "Charlotte", "Valentin", "Mathilde", "Arthur", "Anaïs"
];

const SAMPLE_LASTNAMES = [
  "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand",
  "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David",
  "Bertrand", "Roux", "Vincent", "Fournier", "Morel", "Girard", "Andre", "Lefevre",
  "Mercier", "Dupont", "Lambert", "Bonnet", "Francois", "Martinez", "Legrand", "Garnier"
];

const SAMPLE_PROJECT_TITLES = [
  { slug: "boitier-iot-co2", title: "Boîtier connecté pour capteur CO2" },
  { slug: "bras-robotique-4axes", title: "Bras robotique 4 axes imprimé en 3D" },
  { slug: "lampe-origami-bois", title: "Lampe pliable en contreplaqué gravé laser" },
  { slug: "support-pc-ergonomique", title: "Support d'ordinateur portable modulaire" },
  { slug: "borne-arcade-retrogaming", title: "Borne d'arcade bartop rétro-gaming" },
  { slug: "restauration-ampli-audio", title: "Restauration d'amplificateur audio vintage" },
  { slug: "prototype-drone-fpv", title: "Châssis et pièces de drone FPV" },
  { slug: "station-meteo-solaire", title: "Station météo autonome LoRa" },
  { slug: "signaletique-braille-fablab", title: "Panneaux de signalétique inclusive en braille" },
  { slug: "synth-midi-mecanique", title: "Contrôleur MIDI et séquenceur mécanique" },
  { slug: "horloge-digitale-led", title: "Horloge à segments géants LED et PMMA" },
  { slug: "chariot-robot-suiveur", title: "Plateforme mobile suiveuse de ligne" }
];

const VISIT_COMMENTS = [
  "Séance de modélisation et prototypage 3D",
  "Découpe et assemblage de pièces laser",
  "Prototypage électronique et soudure PCB",
  "Usinage CNC d'un châssis",
  "Finition, ponçage et assemblage manuel",
  "Tests de fonctionnement et programmation Arduino/ESP32",
  "Impression de pièces de remplacement",
  "Préparation de maquette pédagogique",
  "Projet personnel de fabrication numérique",
  "Découpe de vinyle et gravure"
];

const WARNING_COMMENTS = [
  "Non-port des lunettes de protection pendant l'usinage",
  "Poste de travail et machine non nettoyés après utilisation",
  "Départ sans pointage de sortie au kiosque",
  "Dépassement du créneau de réservation machine",
  "Matériau non homologué utilisé sur la découpeuse laser"
];

// --- Lecture des arguments CLI ---
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    days: 90,
    minUsers: 20,
    clean: false,
    verbose: true,
  };

  for (const arg of args) {
    if (arg.startsWith("--days=")) {
      const val = parseInt(arg.split("=")[1], 10);
      if (!isNaN(val) && val > 0) options.days = val;
    } else if (arg.startsWith("--months=")) {
      const val = parseInt(arg.split("=")[1], 10);
      if (!isNaN(val) && val > 0) options.days = val * 30;
    } else if (arg.startsWith("--users=")) {
      const val = parseInt(arg.split("=")[1], 10);
      if (!isNaN(val) && val > 0) options.minUsers = val;
    } else if (arg === "--clean" || arg === "--reset") {
      options.clean = true;
    }
  }

  return options;
}

// --- Exécution principale ---
async function run() {
  const opts = parseArgs();

  console.log("===============================================================");
  console.log("🚀 FabtrackJS : Générateur d'Activité et Historique Adaptatif");
  console.log("===============================================================\n");

  // 1. Détection et introspection de l'existant
  console.log("🔍 Étape 1 : Analyse des données existantes en base...");

  const existingUsertypes = await prisma.usertype.findMany();
  const existingProjecttypes = await prisma.projecttype.findMany();
  const existingWorkspaces = await prisma.workspace.findMany();
  const existingCategories = await prisma.category.findMany();
  const existingMachines = await prisma.machine.findMany();
  const existingConsumables = await prisma.consumable.findMany();
  const existingWarningtypes = await prisma.warningtype.findMany();
  const existingTeachingUnits = await prisma.teachingUnit.findMany();
  let users = await prisma.user.findMany({
    include: {
      usertype: true,
      projects: { include: { project: true } },
    },
  });

  console.log(`  • Types d'usagers trouvés        : ${existingUsertypes.length} (${existingUsertypes.map((u) => u.name).join(", ") || "aucun"})`);
  console.log(`  • Types de projets trouvés       : ${existingProjecttypes.length} (${existingProjecttypes.map((p) => p.name).join(", ") || "aucun"})`);
  console.log(`  • Espaces (Workspaces) trouvés   : ${existingWorkspaces.length} (${existingWorkspaces.map((w) => w.name).join(", ") || "aucun"})`);
  console.log(`  • Catégories trouvées            : ${existingCategories.length}`);
  console.log(`  • Machines trouvées              : ${existingMachines.length} (${existingMachines.map((m) => m.name).slice(0, 4).join(", ")}${existingMachines.length > 4 ? "..." : ""})`);
  console.log(`  • Consommables trouvés           : ${existingConsumables.length} (${existingConsumables.map((c) => c.name).slice(0, 4).join(", ")}${existingConsumables.length > 4 ? "..." : ""})`);
  console.log(`  • Types d'avertissements trouvés : ${existingWarningtypes.length} (${existingWarningtypes.map((w) => w.name).join(", ") || "aucun"})`);
  console.log(`  • Unités d'Enseignement (UE)     : ${existingTeachingUnits.length}`);
  console.log(`  • Usagers existants              : ${users.length}\n`);

  if (existingUsertypes.length === 0) {
    console.log("⚠️  Aucun type d'usager (Usertype) trouvé. Création d'un type par défaut 'Adhérent'...");
    const created = await prisma.usertype.create({ data: { name: "Adhérent" } });
    existingUsertypes.push(created);
  }

  // 2. Nettoyage optionnel si --clean
  if (opts.clean) {
    console.log("🧹 Option --clean demandée : Purge de l'historique, activités et avertissements existants...");
    await prisma.activity.deleteMany({});
    await prisma.history.deleteMany({});
    await prisma.warning.deleteMany({});
    console.log("   Historique réinitialisé avec succès.\n");
  }

  // 3. Garantir un pool suffisant d'usagers réalistes
  if (users.length < opts.minUsers) {
    const toCreate = opts.minUsers - users.length;
    console.log(`👥 Étape 2 : Création de ${toCreate} usagers réalistes adaptés à vos types existants...`);

    for (let i = 0; i < toCreate; i++) {
      const name = pickRandom(SAMPLE_FIRSTNAMES);
      const surname = pickRandom(SAMPLE_LASTNAMES);
      const usertype = pickRandom(existingUsertypes);
      const uniqueSuffix = randomInt(100, 999);
      const email = `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}.${surname.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}${uniqueSuffix}@fablab.local`;
      const token = uuidv4();
      const rfid = crypto.randomBytes(4).toString("hex").toUpperCase();

      try {
        const createdUser = await prisma.user.create({
          data: {
            name,
            surname,
            email,
            usertypeId: usertype.id,
            birthYear: randomInt(1980, 2005),
            comment: "Usager actif généré pour simulation d'activité",
            termsAccepted: true, // Charte signée pour pouvoir pointer
            token,
            rfid,
            balance: randomInt(0, 50),
          },
        });
        users.push({ ...createdUser, usertype, projects: [] });
      } catch (err) {
        // En cas de collision email ou RFID rare
      }
    }
    console.log(`   Total d'usagers disponibles : ${users.length}\n`);
  }

  // 4. Garantir des projets rattachés aux usagers si des projecttypes existent
  if (existingProjecttypes.length > 0) {
    console.log("📦 Étape 3 : Vérification et attribution de projets aux usagers...");
    let projectsCreated = 0;

    for (const user of users) {
      if (!user.projects || user.projects.length === 0) {
        // Attribuer 1 ou 2 projets à ~70% des usagers
        if (randomChance(70)) {
          const numProjects = randomInt(1, 2);
          for (let p = 0; p < numProjects; p++) {
            const sample = pickRandom(SAMPLE_PROJECT_TITLES);
            const projecttype = pickRandom(existingProjecttypes);
            const teachingUnit = existingTeachingUnits.length > 0 && randomChance(40) ? pickRandom(existingTeachingUnits) : null;
            const uniqueUrl = `https://wiki.fablab.sorbonne-universite.fr/projets/${sample.slug}-${user.id}-${randomInt(10, 99)}`;

            try {
              const project = await prisma.project.create({
                data: {
                  url: uniqueUrl,
                  projecttypeId: projecttype.id,
                  teachingUnitId: teachingUnit ? teachingUnit.id : null,
                  active: true,
                },
              });

              const up = await prisma.userProject.create({
                data: {
                  userId: user.id,
                  projectId: project.id,
                },
                include: { project: true },
              });

              user.projects = user.projects || [];
              user.projects.push(up);
              projectsCreated++;
            } catch (err) {
              // Ignore URL conflict
            }
          }
        }
      }
    }
    console.log(`   ${projectsCreated} projets créés et reliés aux types existants.\n`);
  }

  // 5. Génération chronologique des visites et activités
  console.log(`📅 Étape 4 : Génération de l'historique sur les ${opts.days} derniers jours...`);

  const now = new Date();
  const startDate = new Date(now.getTime() - opts.days * 24 * 60 * 60 * 1000);
  startDate.setHours(9, 0, 0, 0);

  let currentDate = new Date(startDate);
  let totalVisits = 0;
  let totalMachineActs = 0;
  let totalConsumableActs = 0;
  let totalWarnings = 0;

  while (currentDate <= now) {
    const dayOfWeek = currentDate.getDay(); // 0 = Dimanche, 1 = Lundi... 6 = Samedi

    // Modélisation de l'affluence du Fablab
    let visitsCount = 0;
    if (dayOfWeek === 0) {
      visitsCount = 0; // Fermé le dimanche
    } else if (dayOfWeek === 6) {
      visitsCount = randomInt(1, 4); // Samedi calme/ouvert
    } else if (dayOfWeek === 3 || dayOfWeek === 4) {
      visitsCount = randomInt(4, 9); // Mercredi & Jeudi : forte affluence
    } else if (dayOfWeek === 2 || dayOfWeek === 5) {
      visitsCount = randomInt(3, 7); // Mardi & Vendredi : affluence moyenne
    } else if (dayOfWeek === 1) {
      visitsCount = randomInt(2, 5); // Lundi : reprise
    }

    // Répartir les visites dans la journée
    for (let v = 0; v < visitsCount; v++) {
      const user = pickRandom(users);
      if (!user) continue;

      const workspace = existingWorkspaces.length > 0 ? pickRandom(existingWorkspaces) : null;

      // Heure d'arrivée entre 9h et 18h
      const arrivalHour = randomInt(9, 17);
      const arrivalMinute = pickRandom([0, 10, 15, 20, 30, 40, 45]);
      const arrival = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
        arrivalHour,
        arrivalMinute,
        0
      );

      // Si la date calculée dépasse l'instant présent, on s'arrête
      if (arrival > now) break;

      // Durée de visite entre 35 minutes et 4 heures
      const durationMin = randomInt(35, 240);
      let departure = new Date(arrival.getTime() + durationMin * 60000);
      if (departure > now) {
        // Visite en cours aujourd'hui
        departure = null;
      }

      // Projet associé
      let userproject = null;
      if (user.projects && user.projects.length > 0 && randomChance(65)) {
        userproject = pickRandom(user.projects);
      }

      // UE associée
      let teachingUnitId = null;
      if (userproject && userproject.project && userproject.project.teachingUnitId) {
        teachingUnitId = userproject.project.teachingUnitId;
      } else if (existingTeachingUnits.length > 0 && randomChance(25)) {
        teachingUnitId = pickRandom(existingTeachingUnits).id;
      }

      // Création de l'entrée de visite (History)
      const history = await prisma.history.create({
        data: {
          arrival,
          departure,
          userId: user.id,
          userprojectId: userproject ? userproject.id : null,
          teachingUnitId,
          workspaceId: workspace ? workspace.id : null,
          comments: randomChance(20) ? pickRandom(VISIT_COMMENTS) : null,
        },
      });
      totalVisits++;

      // 5.a Utilisation de Machine (Activity - MACHINE)
      let usedMachineId = null;
      if (existingMachines.length > 0 && randomChance(65)) {
        // Si possible, machine de la même catégorie ou espace
        let candidateMachines = existingMachines;
        if (workspace) {
          const catIds = existingCategories.filter((c) => c.workspaceId === workspace.id).map((c) => c.id);
          const wsMachines = existingMachines.filter((m) => catIds.includes(m.categoryId));
          if (wsMachines.length > 0) candidateMachines = wsMachines;
        }

        const machine = pickRandom(candidateMachines);
        if (machine) {
          usedMachineId = machine.id;
          await prisma.activity.create({
            data: {
              createdAt: arrival,
              historyId: history.id,
              userId: user.id,
              resourceType: "MACHINE",
              resourceId: machine.id,
            },
          });
          totalMachineActs++;
        }
      }

      // 5.b Consommation de matière (Activity - CONSUMABLE)
      if (existingConsumables.length > 0 && randomChance(55)) {
        const consumable = pickRandom(existingConsumables);
        if (consumable) {
          // Quantité intelligente selon l'unité déclarée
          const unit = (consumable.unit || "").toLowerCase();
          const name = (consumable.name || "").toLowerCase();
          let quantity = 1;

          if (unit.includes("g") || name.includes("pla") || name.includes("filament") || name.includes("résine")) {
            quantity = randomInt(20, 180);
          } else if (unit.includes("ml") || unit.includes("cl")) {
            quantity = randomInt(15, 60);
          } else if (unit.includes("m") || unit.includes("mètre")) {
            quantity = randomInt(1, 4);
          } else {
            quantity = randomInt(1, 3);
          }

          await prisma.activity.create({
            data: {
              createdAt: arrival,
              historyId: history.id,
              userId: user.id,
              resourceType: "CONSUMABLE",
              resourceId: consumable.id,
              quantity,
            },
          });
          totalConsumableActs++;
        }
      }

      // 5.c Avertissement occasionnel (Warning) - ~1% de chance
      if (existingWarningtypes.length > 0 && randomChance(1.2)) {
        const warningtype = pickRandom(existingWarningtypes);
        if (warningtype) {
          await prisma.warning.create({
            data: {
              userId: user.id,
              warningtypeId: warningtype.id,
              active: randomChance(40), // 40% encore actif, 60% résolu
              createdAt: arrival,
              comments: pickRandom(WARNING_COMMENTS),
            },
          });
          totalWarnings++;
        }
      }
    }

    // Passer au jour suivant
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Bilan final
  console.log("\n===============================================================");
  console.log("✅ Simulation d'activité terminée avec succès !");
  console.log("===============================================================");
  console.log(`📊 Bilan de l'historique généré :`);
  console.log(`  • Période simulée            : ${opts.days} jours (jusqu'à aujourd'hui)`);
  console.log(`  • Visites créées (History)    : ${totalVisits}`);
  console.log(`  • Activités Machines          : ${totalMachineActs}`);
  console.log(`  • Consommations Matières      : ${totalConsumableActs}`);
  console.log(`  • Avertissements créés        : ${totalWarnings}`);
  console.log("===============================================================\n");

  await prisma.$disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error("❌ Erreur lors de la génération de l'activité :", err);
  await prisma.$disconnect();
  process.exit(1);
});
