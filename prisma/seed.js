const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const { faker } = require("@faker-js/faker");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Hash password for admin
  const saltRounds = 10;
  const adminPassword = await bcrypt.hash("admin", saltRounds);

  // Create the admin staff account
  const admin = await prisma.staff.create({
    data: {
      name: "admin",
      email: "admin@example.com",
      password: adminPassword,
      role: "admin",
      approved: true,
    },
  });
  console.log(`Created admin user: ${admin.name}`);

  // Seed Usertype
  await prisma.usertype.createMany({
    data: [{ name: "Student" }, { name: "Startup" }, { name: "Teacher" }],
  });
  console.log("Seeded user types");

  // Seed Users
  const users = [];
  for (let i = 0; i < 10; i++) {
    const randomType = Math.floor(Math.random() * 3) + 1; // 1 to 3

    const name = faker.person.firstName();
    const surname = faker.person.lastName();

    users.push({
      name: name,
      surname: surname,
      email: name + surname + "@gmail.com",
      usertypeId: randomType,
      birthYear: faker.date.birthdate({ min: 1950, max: 2003, mode: "year" }).getFullYear(),
      balance: faker.finance.amount(-20, 50, 2),
      termsAccepted: faker.datatype.boolean(),
      token: faker.string.alphanumeric(20),
    });
  }
  await prisma.user.createMany({ data: users });
  console.log("Seeded users");

  // Seed Projects and Projecttypes
  await prisma.projecttype.createMany({
    data: [{ name: "Research" }, { name: "Personal" }, { name: "Commercial" }],
  });
  console.log("Seeded project types");

  const projects = [];
  for (let i = 0; i < 5; i++) {
    const randomType = Math.floor(Math.random() * 3) + 1; // 1 to 3
    projects.push({
      url: faker.internet.url(),
      projecttypeId: randomType,
    });
  }
  await prisma.project.createMany({ data: projects });
  console.log("Seeded projects");

  // Seed Workspaces
  const workspaces = [];
  for (let i = 0; i < 3; i++) {
    workspaces.push({
      name: `Workspace ${i + 1}`,
      location: faker.location.streetAddress(),
    });
  }
  await prisma.workspace.createMany({ data: workspaces });
  console.log("Seeded workspaces");

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
