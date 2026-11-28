const staffContributorService = require("../../services/staffContributorService.js");
const { StaffAdminService } = require("../../services/staffAdminService.js");

function createMockDeps() {
  const prisma = {
    staff: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(2),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    usertype: {
      findMany: jest.fn().mockResolvedValue([{ id: 3, name: "Personnel Fablab" }]),
    },
  };
  const mailService = {
    sendStaffApprovedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendAgreementEmail: jest.fn().mockResolvedValue({ success: true }),
  };
  const logger = { logThat: jest.fn() };
  const staffSessionService = { invalidateStaffSessionCache: jest.fn() };
  return { prisma, mailService, logger, staffSessionService };
}

describe("R-037 — Staff to Contributor automatic linking on approval & self-completion", () => {
  test("approving a mediator with self-provided info creates exactly one contributor with termsAccepted=true, sends NO agreement email, and is idempotent on repeat approvals", async () => {
    const deps = createMockDeps();
    const staffBefore = {
      id: 10,
      name: "jdupont_login",
      email: "jean.dupont@fablab.fr",
      role: "user",
      approved: false,
      firstName: "Jean",
      lastName: "Dupont",
      usertypeId: 3,
      userId: null,
    };
    const staffApproved = { ...staffBefore, approved: true };
    const createdUser = {
      id: 501,
      name: "Jean",
      surname: "Dupont",
      email: "jean.dupont@fablab.fr",
      usertypeId: 3,
      termsAccepted: true,
      deletedAt: null,
    };

    deps.prisma.staff.findUnique.mockResolvedValueOnce(staffBefore);
    deps.prisma.staff.update
      .mockResolvedValueOnce(staffApproved) // enableStaff sets approved=true
      .mockResolvedValueOnce({ ...staffApproved, userId: 501 }); // link Staff.userId
    deps.prisma.user.findUnique.mockResolvedValueOnce(null);
    deps.prisma.user.create.mockResolvedValueOnce(createdUser);

    const adminSvc = new StaffAdminService(deps);
    const first = await adminSvc.enableStaff({
      targetId: 10,
      actor: { staffId: 1, username: "admin" },
      hostUrl: "http://localhost:8080",
    });

    expect(first.success).toBe(true);
    expect(first.contributorLink.status).toBe("created");
    expect(deps.prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Jean",
        surname: "Dupont",
        email: "jean.dupont@fablab.fr",
        usertypeId: 3,
        termsAccepted: true,
      }),
    });
    expect(deps.mailService.sendAgreementEmail).not.toHaveBeenCalled();

    // Second approval (idempotent) resolves to exact same contributor without creating a second User
    deps.prisma.staff.findUnique.mockResolvedValueOnce({ ...staffApproved, userId: 501 });
    deps.prisma.staff.update.mockResolvedValueOnce({ ...staffApproved, userId: 501 });
    deps.prisma.user.findUnique.mockResolvedValueOnce(createdUser);

    const second = await adminSvc.enableStaff({
      targetId: 10,
      actor: { staffId: 1, username: "admin" },
      hostUrl: "http://localhost:8080",
    });

    expect(second.success).toBe(true);
    expect(second.contributorLink.status).toBe("already_linked");
    expect(second.contributorLink.user.id).toBe(501);
    expect(deps.prisma.user.create).toHaveBeenCalledTimes(1);
  });

  test("reuses existing active contributor with same email, preserves ID/RFID/visits, marks termsAccepted=true, sends NO agreement email", async () => {
    const deps = createMockDeps();
    const existingActiveUser = {
      id: 88,
      name: "Nadia",
      surname: "Benali",
      email: "nadia@fablab.fr",
      rfid: "04AABBCC",
      usertypeId: 2,
      termsAccepted: false,
      deletedAt: null,
    };

    deps.prisma.user.findUnique.mockResolvedValueOnce(existingActiveUser);
    deps.prisma.user.update.mockResolvedValueOnce({ ...existingActiveUser, termsAccepted: true });
    deps.prisma.staff.update.mockResolvedValueOnce({ id: 12, userId: 88 });

    const outcome = await staffContributorService.ensureStaffContributorLink({
      prisma: deps.prisma,
      staffRecord: {
        id: 12,
        name: "nbenali",
        email: "nadia@fablab.fr",
        role: "admin",
        approved: true,
        firstName: null,
        lastName: null,
        usertypeId: null,
        userId: null,
      },
      actorUsername: "admin",
      logger: deps.logger,
    });

    expect(outcome.status).toBe("linked_existing");
    expect(outcome.user.id).toBe(88);
    expect(outcome.user.rfid).toBe("04AABBCC");
    expect(outcome.user.termsAccepted).toBe(true);
    expect(deps.prisma.user.create).not.toHaveBeenCalled();
    expect(deps.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 88 },
      data: { termsAccepted: true },
    });
    expect(deps.prisma.staff.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: expect.objectContaining({ userId: 88 }),
    });
    expect(deps.mailService.sendAgreementEmail).not.toHaveBeenCalled();
  });

  test("never turns login username into civil name when info is missing; self-completion creates and links profile", async () => {
    const deps = createMockDeps();
    deps.prisma.user.findUnique.mockResolvedValueOnce(null);

    const missingOutcome = await staffContributorService.ensureStaffContributorLink({
      prisma: deps.prisma,
      staffRecord: {
        id: 15,
        name: "jdoe_99",
        email: "jdoe@fablab.fr",
        role: "user",
        approved: true,
        firstName: null,
        lastName: null,
        usertypeId: null,
        userId: null,
      },
      logger: deps.logger,
    });

    expect(missingOutcome.status).toBe("missing_info");
    expect(missingOutcome.missingFields).toEqual(["firstName", "lastName", "usertypeId"]);
    expect(deps.prisma.user.create).not.toHaveBeenCalled();

    // Staff member completes their own profile
    const updatedStaff = {
      id: 15,
      name: "jdoe_99",
      email: "jdoe@fablab.fr",
      role: "user",
      approved: true,
      firstName: "Julie",
      lastName: "Doe",
      usertypeId: 3,
      userId: null,
    };
    deps.prisma.staff.findUnique.mockResolvedValueOnce({ ...updatedStaff, firstName: null, lastName: null, usertypeId: null });
    deps.prisma.staff.update
      .mockResolvedValueOnce(updatedStaff)
      .mockResolvedValueOnce({ ...updatedStaff, userId: 777 });
    deps.prisma.user.findUnique.mockResolvedValueOnce(null);
    deps.prisma.user.create.mockResolvedValueOnce({
      id: 777,
      name: "Julie",
      surname: "Doe",
      email: "jdoe@fablab.fr",
      usertypeId: 3,
      termsAccepted: true,
    });

    const completed = await staffContributorService.completeSelfProfileAndLink({
      prisma: deps.prisma,
      staffId: 15,
      firstName: "Julie",
      lastName: "Doe",
      usertypeId: 3,
      logger: deps.logger,
    });

    expect(completed.status).toBe("created");
    expect(completed.linked).toBe(true);
    expect(completed.user.name).toBe("Julie");
    expect(completed.user.surname).toBe("Doe");
  });

  test("pending accounts and technical borne accounts (role === 'staff') never trigger contributor creation", async () => {
    const deps = createMockDeps();

    const pending = await staffContributorService.ensureStaffContributorLink({
      prisma: deps.prisma,
      staffRecord: {
        id: 20,
        name: "pending_med",
        email: "pending@fablab.fr",
        role: "user",
        approved: false,
        firstName: "Paul",
        lastName: "Durand",
        usertypeId: 3,
      },
      logger: deps.logger,
    });
    expect(pending.status).toBe("skipped_unapproved");

    const borne = await staffContributorService.ensureStaffContributorLink({
      prisma: deps.prisma,
      staffRecord: {
        id: 21,
        name: "borne_accueil",
        email: "borne@fablab.fr",
        role: "staff",
        approved: true,
        firstName: "Borne",
        lastName: "Lab",
        usertypeId: 3,
      },
      logger: deps.logger,
    });
    expect(borne.status).toBe("skipped_role");
    expect(deps.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(deps.prisma.user.create).not.toHaveBeenCalled();
  });

  test("archived contributor match (deletedAt != null) is flagged for admin review without auto-reactivation", async () => {
    const deps = createMockDeps();
    deps.prisma.user.findUnique.mockResolvedValueOnce({
      id: 300,
      name: "Marc",
      surname: "Ancien",
      email: "marc@fablab.fr",
      deletedAt: new Date("2025-06-01T00:00:00Z"),
    });

    const outcome = await staffContributorService.ensureStaffContributorLink({
      prisma: deps.prisma,
      staffRecord: {
        id: 30,
        name: "marc_staff",
        email: "marc@fablab.fr",
        role: "user",
        approved: true,
        firstName: "Marc",
        lastName: "Ancien",
        usertypeId: 3,
        userId: null,
      },
      logger: deps.logger,
    });

    expect(outcome.status).toBe("archived_match");
    expect(outcome.linked).toBe(false);
    expect(outcome.message).toMatch(/archivée/i);
    expect(deps.prisma.user.update).not.toHaveBeenCalled();
    expect(deps.prisma.user.create).not.toHaveBeenCalled();
    expect(deps.prisma.staff.update).not.toHaveBeenCalled();
  });
});
