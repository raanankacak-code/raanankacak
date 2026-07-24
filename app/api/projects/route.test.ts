import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const listProjectsForOrgViaSessionMock = vi.fn();
const createProjectMock = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    requireMember: requireMemberMock,
    // Mutation handlers use the write-gated variant; route through the same
    // mock so these tests stay focused on their own concern, not billing.
    requireWritableMember: requireMemberMock,
  };
});

vi.mock("@/lib/db/projects", () => ({
  listProjectsForOrgViaSession: listProjectsForOrgViaSessionMock,
  createProject: createProjectMock,
}));

const assertCanCreateProjectMock = vi.fn();

vi.mock("@/lib/billing/limits", () => ({
  assertCanCreateProject: assertCanCreateProjectMock,
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
  listProjectsForOrgViaSessionMock.mockReset();
  createProjectMock.mockReset();
  assertCanCreateProjectMock.mockReset();
  assertCanCreateProjectMock.mockResolvedValue(undefined);
});

describe("GET /api/projects", () => {
  it("scopes the listing to the signed-in member's own org, never a client-supplied one", async () => {
    // This route reads through the session-scoped (RLS-subject) client as a
    // tenant-isolation pilot — the org_id filter passed here is defense in
    // depth, not the sole guarantee; see listProjectsForOrgViaSession's
    // doc comment and supabase/schema.sql's RLS policies for the rest.
    requireMemberMock.mockResolvedValue(MEMBER_ORG_A);
    listProjectsForOrgViaSessionMock.mockResolvedValue([{ id: "p1" }]);

    const res = await GET();

    expect(listProjectsForOrgViaSessionMock).toHaveBeenCalledWith("org-A");
    expect(listProjectsForOrgViaSessionMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projects: [{ id: "p1" }] });
  });

  it("returns 401 and never queries the DB when the caller isn't signed in", async () => {
    requireMemberMock.mockRejectedValue(new ApiError(401, "Not signed in"));

    const res = await GET();

    expect(res.status).toBe(401);
    expect(listProjectsForOrgViaSessionMock).not.toHaveBeenCalled();
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

  it("returns 402 and never creates the project when the plan's project limit is reached", async () => {
    requireMemberMock.mockResolvedValue(MEMBER_ORG_A);
    assertCanCreateProjectMock.mockRejectedValue(new ApiError(402, "The Starter plan includes 3 active projects."));

    const res = await POST(postRequest({ name: "Riverside Phase 3" }));

    expect(res.status).toBe(402);
    expect(createProjectMock).not.toHaveBeenCalled();
  });
});
