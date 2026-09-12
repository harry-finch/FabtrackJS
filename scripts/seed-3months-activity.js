const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function run() {
  console.log("Starting 3-month activity generation...");

  // Fetch reference data
  const users = await prisma.user.findMany({
    include: {
      usertype: true,
      projects: { include: { project: { include: { projecttype: true } } } },
    },
  });

  const workspaces = await prisma.workspace.findMany();
  const machines = await prisma.machine.findMany();
  const consumables = await prisma.consumable.findMany();
  const teachingUnits = await prisma.teachingUnit.findMany();

  console.log(`Found ${users.length} users, ${workspaces.length} workspaces, ${machines.length} machines, ${consumables.length} consumables.`);

  const startDate = new Date(2026, 5, 12); // June 12, 2026
  const endDate = new Date(2026, 8, 11);   // September 11, 2026

  let currentDate = new Date(startDate);
  let totalVisitsCreated = 0;
  let totalActivitiesCreated = 0;

  // Workspaces mapping
  const ws1 = workspaces.find((w) => w.id === 1) || workspaces[0];
  const ws2 = workspaces.find((w) => w.id === 2) || workspaces[1] || workspaces[0];
  const ws3 = workspaces.find((w) => w.id === 3) || workspaces[2] || workspaces[0];

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    let visitsCount = 0;
    if (dayOfWeek === 0) {
      // Sunday closed
      visitsCount = 0;
    } else if (dayOfWeek === 6) {
      // Saturday: 0 to 2
      visitsCount = randomInt(0, 2);
    } else if (dayOfWeek === 3) {
      // Wednesday peak: 3 to 6
      visitsCount = randomInt(3, 6);
    } else if (dayOfWeek === 4) {
      // Thursday peak: 3 to 5
      visitsCount = randomInt(3, 5);
    } else if (dayOfWeek === 2) {
      // Tuesday: 2 to 4
      visitsCount = randomInt(2, 4);
    } else if (dayOfWeek === 5) {
      // Friday: 2 to 4
      visitsCount = randomInt(2, 4);
    } else if (dayOfWeek === 1) {
      // Monday: 1 to 3
      visitsCount = randomInt(1, 3);
    }

    for (let v = 0; v < visitsCount; v++) {
      const user = pickRandom(users);

      // Workspace distribution
      const wsRand = Math.random();
      let workspace = ws1;
      if (wsRand > 0.8) workspace = ws3;
      else if (wsRand > 0.5) workspace = ws2;

      // Project selection
      let userproject = null;
      if (user.projects && user.projects.length > 0 && Math.random() > 0.15) {
        userproject = pickRandom(user.projects);
      }

      // Teaching unit for academic users
      let teachingUnitId = null;
      let unregisteredUeName = null;
      let unregisteredUeContact = null;
      if (user.usertype.name === "Student" || user.usertype.name === "Teacher" || (userproject && userproject.project.projecttype.name === "Academic")) {
        const ueRand = Math.random();
        if (ueRand < 0.35 && teachingUnits.length > 0) {
          teachingUnitId = pickRandom(teachingUnits).id;
        } else if (ueRand < 0.45) {
          unregisteredUeName = pickRandom(["UE-IN301", "UE-ROB402", "UE-PROJ500"]);
          unregisteredUeContact = "resp-" + unregisteredUeName.toLowerCase() + "@sorbonne-universite.fr";
        }
      }

      // Arrival & Departure time
      const hour = randomInt(9, 17);
      const minute = pickRandom([0, 15, 30, 45]);
      const arrival = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), hour, minute, 0);

      // Duration: between 40 and 240 minutes
      const durationMin = randomInt(40, 240);
      const departure = new Date(arrival.getTime() + durationMin * 60000);

      // Create history entry
      const history = await prisma.history.create({
        data: {
          arrival,
          departure,
          userId: user.id,
          userprojectId: userproject ? userproject.id : null,
          teachingUnitId,
          unregisteredUeName,
          unregisteredUeContact,
          workspaceId: workspace ? workspace.id : null,
          comments: Math.random() < 0.2 ? "Session de prototypage et fabrication" : null,
        },
      });
      totalVisitsCreated++;

      // Create machine activities (approx 65% chance)
      let machineUsed = null;
      if (Math.random() < 0.65) {
        if (workspace.id === 1) {
          // Digital Fab: Ultimaker S5 (1), Prusa MK4 (2), or Epilog Laser (3)
          machineUsed = pickRandom([1, 2, 3]);
        } else if (workspace.id === 2) {
          // Electronics: Laser or 3D printer
          machineUsed = pickRandom([2, 3]);
        } else {
          // Woodworking: ShopBot (4) or Epilog Laser (3)
          machineUsed = pickRandom([3, 4]);
        }

        const machineExists = machines.some((m) => m.id === machineUsed);
        if (machineExists) {
          await prisma.activity.create({
            data: {
              createdAt: arrival,
              historyId: history.id,
              userId: user.id,
              resourceType: "MACHINE",
              resourceId: machineUsed,
            },
          });
          totalActivitiesCreated++;
        }
      }

      // Create consumable activities (approx 60% chance)
      if (Math.random() < 0.60) {
        let consumableId = null;
        let quantity = 1;

        if (machineUsed === 1 || machineUsed === 2) {
          // 3D printing
          consumableId = pickRandom([1, 8]); // PLA or PETG
          quantity = randomInt(25, 200); // grams
        } else if (machineUsed === 3) {
          // Laser cutter
          consumableId = pickRandom([3, 4]); // Plywood or Acrylic
          quantity = randomInt(1, 3);
        } else if (machineUsed === 4) {
          // CNC
          consumableId = pickRandom([3, 6]); // Plywood or End Mill
          quantity = consumableId === 6 ? 1 : randomInt(1, 2);
        } else {
          // Manual / general
          consumableId = pickRandom([5, 7]); // Solder wire or Masking tape
          quantity = consumableId === 5 ? randomInt(5, 25) : 1;
        }

        const consumableExists = consumables.some((c) => c.id === consumableId);
        if (consumableExists) {
          await prisma.activity.create({
            data: {
              createdAt: arrival,
              historyId: history.id,
              userId: user.id,
              resourceType: "CONSUMABLE",
              resourceId: consumableId,
              quantity,
            },
          });
          totalActivitiesCreated++;
        }
      }
    }

    // Advance to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`✅ Completed! Created ${totalVisitsCreated} visits and ${totalActivitiesCreated} activities across 3 months.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Error generating activity:", err);
  process.exit(1);
});
