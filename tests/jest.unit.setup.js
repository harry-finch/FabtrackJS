/**
 * Unit test isolation setup (loaded ONLY by the Jest "unit" project).
 * Allows services that instantiate `new PrismaClient()` at module import time
 * to load cleanly without any DATABASE_URL or MariaDB pool, while failing fast
 * if a pure unit test attempts to execute an unmocked database query.
 */
function mockCreateForbiddenPrismaProxy() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "$disconnect" || prop === "$connect") {
          return async () => {};
        }
        if (prop === "then" || prop === Symbol.toStringTag || prop === "__esModule") {
          return undefined;
        }
        return new Proxy(
          {},
          {
            get(_modelTarget, method) {
              if (method === "then") return undefined;
              return () => {
                throw new Error(
                  `Requête Prisma réelle interdite dans les tests unitaires (${String(prop)}.${String(method)}). Mockez Prisma ou déplacez ce test dans tests/integration/.`
                );
              };
            },
          }
        );
      },
    }
  );
}

const mockEnumStubs = {
  ResourceType: {
    MACHINE: "MACHINE",
    EQUIPMENT: "EQUIPMENT",
    CONSUMABLE: "CONSUMABLE",
  },
  ConsumableStatus: {
    AVAILABLE: "AVAILABLE",
    LOW_STOCK: "LOW_STOCK",
    OUT_OF_STOCK: "OUT_OF_STOCK",
  },
  StaffRole: {
    admin: "admin",
    user: "user",
    staff: "staff",
  },
  EquipmentStatus: {
    AVAILABLE: "AVAILABLE",
    OUT_OF_SERVICE: "OUT_OF_SERVICE",
    DECOMMISSIONED: "DECOMMISSIONED",
  },
  MachineIssueStatus: {
    OPEN: "OPEN",
    RESOLVED: "RESOLVED",
  },
  RepairStatus: {
    PENDING: "PENDING",
    REPAIRED: "REPAIRED",
    PARTIALLY_REPAIRED: "PARTIALLY_REPAIRED",
    NOT_REPAIRED: "NOT_REPAIRED",
    NEEDS_RETURN: "NEEDS_RETURN",
  },
};

class mockUnitStubPrismaClient {
  constructor() {
    return mockCreateForbiddenPrismaProxy();
  }
}

jest.mock("@prisma/client", () => ({
  PrismaClient: mockUnitStubPrismaClient,
  ...mockEnumStubs,
}));

jest.mock("../utilities/db", () => ({
  prisma: mockCreateForbiddenPrismaProxy(),
  PrismaClient: mockUnitStubPrismaClient,
  ...mockEnumStubs,
  createMariaDbAdapter: () => {
    throw new Error("createMariaDbAdapter() ne doit pas être appelé dans les tests unitaires.");
  },
  closePool: async () => {},
}));
