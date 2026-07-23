import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const listProjectsForOrgMock = vi.fn();
const createProjectMock = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    requireMember: requireMemberMock,
  };
});

vi.mock("@/lib/db/projects", () => ({
  listProjectsForOrg: listProjectsForOrgMock,
  createProject: createProjectMock,
}));

const { GET, POST } = await import("@/app/api/projects/route");
const { ApiError } = await import("@/lib/auth");

const MEMBER_ORG_A: OrgMember = {
  id: "member-1",
  orgId: "org-A",
  userId: "user-1",
  name: "Org A Manager",
  email: "manager@org-a.test",
  role: "PROJECT_MANAGER",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireMemberMock.mockReset();
  listProjectsForOrgMock.mockReset();
  createProjectMock.mockReset();
});

describe("GET /api/projects", () => {
  it("scopes the listing to the signed-in member's own org, never a client-supplied one", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_ORG_A);
    listProjectsForOrgMock.mockResolvedValue([{ id: "p1" }]);

    const res = await GET();

    expect(listProjectsForOrgMock).toHaveBeenCalledWith("org-A");
    expect(listProjectsForOrgMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projects: [{ id: "p1" }] });
  });

  it("returns 401 and never queries the DB when the caller isn't signed in", async () => {
    requireMemberMock.mockRejectedValue(new ApiError(401, "Not signed in"));

    const res = await GET();

    expect(res.status).toBe(401);
    expect(listProjectsForOrgMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects", () => {
  it("requires the manageProjects permission", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_ORG_A);
    createProjectMock.mockResolvedValue({ id: "new-project" });

    await POST(postRequest({ name: "Riverside Phase 3" }));

    expect(requireMemberMock).toHaveBeenCalledWith("manageProjects");
  });

  it("returns 403 and never creates a project when the role lacks permission", async () => {
    requireMemberMock.mockRejectedValue(new ApiError(403, "Your role does not have this permission"));

    const res = await POST(postRequest({ name: "Riverside Phase 3" }));

    expect(res.status).toBe(403);
    expect(createProjectMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid body with 400 before touching the database", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_ORG_A);

    const res = await POST(postRequest({ name: "x" })); // below the 2-char minimum

    expect(res.status).toBe(400);
    expect(createProjectMock).not.toHaveBeenCalled();
  });

  it("always creates the project under the session's org, ignoring any org id the client tries to send", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_ORG_A);
    createProjectMock.mockResolvedValue({ id: "new-project" });

    // A malicious/buggy client attempts to smuggle a different org id in the body.
    await POST(postRequest({ name: "Riverside Phase 3", orgId: "org-B", org_id: "org-B" }));

    expect(createProjectMock).toHaveBeenCalledTimes(1);
    expect(createProjectMock.mock.calls[0][0]).toBe("org-A");
  });
});
