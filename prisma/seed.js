const { PrismaClient, ResourceType, ConsumableStatus } = require("@prisma/client");
const bcrypt = require("bcrypt");
const { faker } = require("@faker-js/faker");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Clean up existing records in reverse dependency order
  console.log("Cleaning existing records...");
  await prisma.activity.deleteMany({});
  await prisma.log.deleteMany({});
  await prisma.warning.deleteMany({});
  await prisma.history.deleteMany({});
  await prisma.userProject.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.machine.deleteMany({});
  await prisma.consumable.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.equipment.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.access.deleteMany({});
  await prisma.machineType.deleteMany({});
  await prisma.warningtype.deleteMany({});
  await prisma.projecttype.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.usertype.deleteMany({});
  await prisma.workspace.deleteMany({});
  await prisma.staff.deleteMany({});

  // 2. Staff
  const saltRounds = 10;
  const adminPassword = await bcrypt.hash("admin", saltRounds);

  const admin = await prisma.staff.create({
    data: {
      name: "admin",
      email: "admin@example.com",
      password: adminPassword,
      role: "admin",
      approved: true,
    },
  });

  await prisma.staff.create({
    data: {
      name: "fabmanager",
      email: "manager@fablab.org",
      password: adminPassword,
      role: "admin",
      approved: true,
    },
  });

  await prisma.staff.create({
    data: {
      name: "animator",
      email: "animator@fablab.org",
      password: adminPassword,
      role: "user",
      approved: true,
    },
  });

  await prisma.staff.create({
    data: {
      name: "newstaff",
      email: "newstaff@fablab.org",
      password: adminPassword,
      role: "user",
      approved: false,
    },
  });
  console.log("Seeded staff accounts");

  // 3. User types
  const usertypesData = [
    { name: "Student" },
    { name: "Teacher" },
    { name: "Researcher" },
    { name: "Startup" },
    { name: "External Visitor" },
  ];
  const usertypes = [];
  for (const item of usertypesData) {
    usertypes.push(await prisma.usertype.create({ data: item }));
  }
  console.log("Seeded user types");

  // 4. Project types
  const projecttypesData = [
    { name: "Personal" },
    { name: "Academic" },
    { name: "Research" },
    { name: "Commercial" },
    { name: "Community" },
  ];
  const projecttypes = [];
  for (const item of projecttypesData) {
    projecttypes.push(await prisma.projecttype.create({ data: item }));
  }
  console.log("Seeded project types");

  // 5. Warning types
  const warningtypesData = [
    {
      name: "Safety Violation",
      icon: '<i class="fa-solid fa-triangle-exclamation" style="color: #dc3545"></i>',
    },
    {
      name: "Overdue Balance",
      icon: '<i class="fa-solid fa-money-bill-wave" style="color: #fd7e14"></i>',
    },
    {
      name: "Equipment Damage",
      icon: '<i class="fa-solid fa-fire" style="color: #d63384"></i>',
    },
    {
      name: "Housekeeping",
      icon: '<i class="fa-solid fa-broom" style="color: #ffc107"></i>',
    },
  ];
  const warningtypes = [];
  for (const item of warningtypesData) {
    warningtypes.push(await prisma.warningtype.create({ data: item }));
  }
  console.log("Seeded warning types");

  // 6. Machine Types
  const machinetypesData = [
    { name: "3D Printer (FDM)" },
    { name: "3D Printer (SLA)" },
    { name: "Laser Cutter" },
    { name: "CNC Milling Machine" },
    { name: "Vinyl Cutter" },
    { name: "Electronics Workbench" },
  ];
  const machinetypes = [];
  for (const item of machinetypesData) {
    machinetypes.push(await prisma.machineType.create({ data: item }));
  }
  console.log("Seeded machine types");

  // 7. Access Levels
  const accessData = [
    { name: "Level 1 - Public", description: "Open access after short general lab induction" },
    { name: "Level 2 - Supervised", description: "Operation under staff presence or assistance" },
    { name: "Level 3 - Certified Only", description: "Specific tool certification badge required" },
    { name: "Level 4 - Staff / Expert", description: "Maintenance and high-hazard operation only" },
  ];
  const accessLevels = [];
  for (const item of accessData) {
    accessLevels.push(await prisma.access.create({ data: item }));
  }
  console.log("Seeded access levels");

  // 8. Workspaces
  const workspacesData = [
    { name: "Digital Fabrication Lab", location: "Main Building - Ground Floor" },
    { name: "Electronics & IoT Workshop", location: "Building B - Room 102" },
    { name: "Woodworking & Prototyping", location: "Workshop Hall - Bay 3" },
  ];
  const workspaces = [];
  for (const item of workspacesData) {
    workspaces.push(await prisma.workspace.create({ data: item }));
  }
  console.log("Seeded workspaces");

  // 9. Categories
  const categoriesData = [
    { name: "3D Printing", workspaceId: workspaces[0].id },
    { name: "Laser Processing", workspaceId: workspaces[0].id },
    { name: "Electronics & Soldering", workspaceId: workspaces[1].id },
    { name: "CNC Milling", workspaceId: workspaces[2].id },
    { name: "General Supplies", workspaceId: null },
  ];
  const categories = [];
  for (const item of categoriesData) {
    categories.push(await prisma.category.create({ data: item }));
  }
  console.log("Seeded categories");

  // 10. Locations
  const locationsData = [
    { name: "Zone A - 3D Printing Corner", description: "Along the north windows in main fablab" },
    { name: "Zone B - Laser Room", description: "Enclosed ventilated room" },
    { name: "Zone C - Heavy CNC Booth", description: "Sound-isolated cutting enclosure" },
    { name: "Zone D - Electronics Benches", description: "ESD-protected workstations" },
    { name: "Cabinet 1 - Consumables Storage", description: "Locked supply shelves" },
  ];
  const locations = [];
  for (const item of locationsData) {
    locations.push(await prisma.location.create({ data: item }));
  }
  console.log("Seeded locations");

  // 11. Equipment
  const equipmentData = [
    { name: "Soldering Station Hakko FX-888D" },
    { name: "Digital Multimeter Fluke 115" },
    { name: "Rigol DS1054Z Digital Oscilloscope" },
    { name: "Dremel 4000 Rotary Tool" },
    { name: "Cordless Drill Bosch Professional" },
    { name: "Hot Air Rework Station Quick 861DW" },
  ];
  const equipment = [];
  for (const item of equipmentData) {
    equipment.push(await prisma.equipment.create({ data: item }));
  }
  console.log("Seeded equipment");

  // 12. Consumables
  const consumablesData = [
    { name: "PLA Filament 1.75mm Black (1kg)", cost: 22.5, stock: 18, reorderThreshold: 5, status: ConsumableStatus.AVAILABLE, categoryId: categories[0].id },
    { name: "PETG Filament 1.75mm White (1kg)", cost: 26.0, stock: 9, reorderThreshold: 4, status: ConsumableStatus.AVAILABLE, categoryId: categories[0].id },
    { name: "Plywood Birch 3mm (600x400mm)", cost: 6.5, stock: 30, reorderThreshold: 10, status: ConsumableStatus.AVAILABLE, categoryId: categories[1].id },
    { name: "Clear Acrylic 3mm (600x400mm)", cost: 12.0, stock: 2, reorderThreshold: 5, status: ConsumableStatus.LOW_STOCK, categoryId: categories[1].id },
    { name: "Solder Wire Sn60Pb40 (100g roll)", cost: 8.0, stock: 0, reorderThreshold: 3, status: ConsumableStatus.OUT_OF_STOCK, categoryId: categories[2].id },
    { name: "Carbide End Mill 3.175mm", cost: 14.5, stock: 12, reorderThreshold: 3, status: ConsumableStatus.AVAILABLE, categoryId: categories[3].id },
    { name: "Blue Masking Tape 50mm", cost: 4.2, stock: 15, reorderThreshold: 5, status: ConsumableStatus.AVAILABLE, categoryId: categories[4].id },
  ];
  const consumables = [];
  for (const item of consumablesData) {
    consumables.push(await prisma.consumable.create({ data: item }));
  }
  console.log("Seeded consumables");

  // 13. Machines
  const machinesData = [
    {
      name: "Ultimaker S5",
      machinetypeId: machinetypes[0].id,
      categoryId: categories[0].id,
      make: "Ultimaker",
      model: "S5 Dual Extruder",
      serialNumber: "UM-S5-2024-001",
      internalReference: 101,
      locationId: locations[0].id,
      purchaseDate: new Date("2023-03-15"),
      lastMaintenance: new Date("2024-08-10"),
      warrantyExpiry: new Date("2026-03-15"),
      documentation: "https://support.ultimaker.com",
      accessId: accessLevels[1].id,
    },
    {
      name: "Prusa MK4",
      machinetypeId: machinetypes[0].id,
      categoryId: categories[0].id,
      make: "Prusa Research",
      model: "MK4 Original",
      serialNumber: "PR-MK4-2024-012",
      internalReference: 102,
      locationId: locations[0].id,
      purchaseDate: new Date("2023-11-20"),
      lastMaintenance: new Date("2024-09-01"),
      warrantyExpiry: new Date("2025-11-20"),
      documentation: "https://help.prusa3d.com",
      accessId: accessLevels[0].id,
    },
    {
      name: "Epilog Laser Helix 24",
      machinetypeId: machinetypes[2].id,
      categoryId: categories[1].id,
      make: "Epilog Laser",
      model: "Helix 24 CO2 60W",
      serialNumber: "EP-LX24-2022-099",
      internalReference: 201,
      locationId: locations[1].id,
      purchaseDate: new Date("2022-06-10"),
      lastMaintenance: new Date("2024-07-15"),
      warrantyExpiry: new Date("2025-06-10"),
      documentation: "https://www.epiloglaser.com",
      accessId: accessLevels[1].id,
    },
    {
      name: "ShopBot Desktop MAX",
      machinetypeId: machinetypes[3].id,
      categoryId: categories[3].id,
      make: "ShopBot Tools",
      model: "Desktop MAX CNC",
      serialNumber: "SB-MAX-2023-005",
      internalReference: 301,
      locationId: locations[2].id,
      purchaseDate: new Date("2023-01-05"),
      lastMaintenance: new Date("2024-06-20"),
      warrantyExpiry: new Date("2025-01-05"),
      documentation: "https://www.shopbottools.com",
      accessId: accessLevels[2].id,
    },
  ];
  const machines = [];
  for (const item of machinesData) {
    machines.push(await prisma.machine.create({ data: item }));
  }
  console.log("Seeded machines");

  // 14. Users
  const users = [];
  const sampleUsers = [
    { name: "Alice", surname: "Dubois", email: "alice.dubois@polytechnique.edu", usertypeId: usertypes[0].id, balance: 15.5, termsAccepted: true },
    { name: "Thomas", surname: "Bernard", email: "thomas.bernard@startup-iot.io", usertypeId: usertypes[3].id, balance: -18.0, termsAccepted: true },
    { name: "Claire", surname: "Leroy", email: "claire.leroy@univ-paris.fr", usertypeId: usertypes[1].id, balance: 0.0, termsAccepted: true },
    { name: "Julien", surname: "Moreau", email: "julien.moreau@makerlab.net", usertypeId: usertypes[4].id, balance: 5.0, termsAccepted: false },
    { name: "Sophie", surname: "Roux", email: "sophie.roux@inserm.fr", usertypeId: usertypes[2].id, balance: 35.0, termsAccepted: true },
    { name: "Marc", surname: "David", email: "marc.david@student.fr", usertypeId: usertypes[0].id, balance: -8.5, termsAccepted: true },
    { name: "Elise", surname: "Fournier", email: "elise.fournier@designstudio.org", usertypeId: usertypes[3].id, balance: 20.0, termsAccepted: true },
    { name: "Antoine", surname: "Girard", email: "antoine.girard@gmail.com", usertypeId: usertypes[4].id, balance: 0.0, termsAccepted: true },
  ];

  for (const u of sampleUsers) {
    const createdUser = await prisma.user.create({
      data: {
        name: u.name,
        surname: u.surname,
        email: u.email,
        usertypeId: u.usertypeId,
        birthYear: 1990 + Math.floor(Math.random() * 15),
        balance: u.balance,
        termsAccepted: u.termsAccepted,
        token: faker.string.alphanumeric(32),
        comment: "Regular user interested in rapid prototyping and digital fabrication.",
      },
    });
    users.push(createdUser);
  }
  console.log("Seeded users");

  // 15. Projects & UserProjects
  const sampleProjects = [
    { url: "https://github.com/fablab/open-prosthetic-hand", projecttypeId: projecttypes[2].id },
    { url: "https://wikifactory.com/@alice/drone-carbon-chassis", projecttypeId: projecttypes[0].id },
    { url: "https://makerworld.com/models/smart-air-monitor", projecttypeId: projecttypes[3].id },
    { url: "https://github.com/iot-research/lora-soil-sensor", projecttypeId: projecttypes[1].id },
    { url: "https://instructables.com/diy-midi-controller-wood", projecttypeId: projecttypes[4].id },
  ];

  const projects = [];
  for (const p of sampleProjects) {
    projects.push(await prisma.project.create({ data: p }));
  }

  const userProjects = [];
  userProjects.push(await prisma.userProject.create({ data: { userId: users[0].id, projectId: projects[1].id } }));
  userProjects.push(await prisma.userProject.create({ data: { userId: users[1].id, projectId: projects[2].id } }));
  userProjects.push(await prisma.userProject.create({ data: { userId: users[2].id, projectId: projects[0].id } }));
  userProjects.push(await prisma.userProject.create({ data: { userId: users[4].id, projectId: projects[3].id } }));
  userProjects.push(await prisma.userProject.create({ data: { userId: users[5].id, projectId: projects[4].id } }));
  console.log("Seeded projects & associations");

  // 16. Warnings
  await prisma.warning.create({
    data: {
      userId: users[1].id,
      warningtypeId: warningtypes[1].id,
      active: true,
      comments: "Negative balance exceeds 15€ threshold. Please settle balance at reception.",
    },
  });

  await prisma.warning.create({
    data: {
      userId: users[5].id,
      warningtypeId: warningtypes[3].id,
      active: true,
      comments: "Work area left untidy after laser cutting session on Wednesday.",
    },
  });
  console.log("Seeded warnings");

  // 17. History (Active visits right now in the lab + past visits)
  const now = new Date();

  // Active visit 1: Alice Dubois
  const visit1 = await prisma.history.create({
    data: {
      arrival: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      departure: null,
      userId: users[0].id,
      userprojectId: userProjects[0].id,
      comments: "Printing drone parts with white PETG",
      workspaceId: workspaces[0].id,
    },
  });

  // Active visit 2: Thomas Bernard (has warning and negative balance)
  const visit2 = await prisma.history.create({
    data: {
      arrival: new Date(now.getTime() - 45 * 60 * 1000), // 45 min ago
      departure: null,
      userId: users[1].id,
      userprojectId: userProjects[1].id,
      comments: "Laser cutting acrylic housing",
      workspaceId: workspaces[0].id,
    },
  });

  // Active visit 3: Claire Leroy
  const visit3 = await prisma.history.create({
    data: {
      arrival: new Date(now.getTime() - 30 * 60 * 1000), // 30 min ago
      departure: null,
      userId: users[2].id,
      userprojectId: userProjects[2].id,
      comments: "Prosthetic hand joint testing",
      workspaceId: workspaces[0].id,
    },
  });

  // Past visits
  await prisma.history.create({
    data: {
      arrival: new Date(now.getTime() - 26 * 60 * 60 * 1000),
      departure: new Date(now.getTime() - 22 * 60 * 60 * 1000),
      userId: users[4].id,
      userprojectId: userProjects[3].id,
      comments: "Soldering sensor array",
      workspaceId: workspaces[1].id,
    },
  });
  console.log("Seeded visits and history");

  // 18. Sample Activities linked to visits
  await prisma.activity.create({
    data: {
      historyId: visit1.id,
      userId: users[0].id,
      resourceId: consumables[0].id,
      resourceType: ResourceType.CONSUMABLE,
      quantity: 1,
    },
  });

  await prisma.activity.create({
    data: {
      historyId: visit1.id,
      userId: users[0].id,
      resourceId: machines[0].id,
      resourceType: ResourceType.MACHINE,
    },
  });

  // Visit 2: Thomas Bernard using Acrylic and Laser
  await prisma.activity.create({
    data: {
      historyId: visit2.id,
      userId: users[1].id,
      resourceId: consumables[2].id, // Acrylic sheet
      resourceType: ResourceType.CONSUMABLE,
      quantity: 2,
    },
  });

  await prisma.activity.create({
    data: {
      historyId: visit2.id,
      userId: users[1].id,
      resourceId: machines[1].id, // Laser cutter
      resourceType: ResourceType.MACHINE,
    },
  });

  // Visit 3: Claire Leroy using PLA and Resin
  await prisma.activity.create({
    data: {
      historyId: visit3.id,
      userId: users[2].id,
      resourceId: consumables[0].id, // PLA Black
      resourceType: ResourceType.CONSUMABLE,
      quantity: 1,
    },
  });

  await prisma.activity.create({
    data: {
      historyId: visit3.id,
      userId: users[2].id,
      resourceId: machines[0].id, // 3D printer
      resourceType: ResourceType.MACHINE,
    },
  });

  console.log("Seeded activities");

  console.log("Seeding complete successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
