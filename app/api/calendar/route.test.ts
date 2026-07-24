import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const createEventMock = vi.fn();
const listEventsForOrgViaSessionMock = vi.fn();
const getProjectByIdMock = vi.fn();

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

vi.mock("@/lib/db/calendar", () => ({
  listEventsForOrgViaSession: listEventsForOrgViaSessionMock,
  createEvent: createEventMock,
}));

vi.mock("@/lib/db/projects", () => ({
  getProjectById: getProjectByIdMock,
}));

const { POST } = await import("@/app/api/calendar/route");

const MEMBER: OrgMember = {
  id: "member-1",
  orgId: "org-A",
  userId: "user-1",
  name: "Org A Member",
  email: "member@org-a.test",
  role: "PROJECT_MANAGER",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/calendar", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  requireMemberMock.mockReset();
  createEventMock.mockReset();
  listEventsForOrgViaSessionMock.mockReset();
  getProjectByIdMock.mockReset();
  requireMemberMock.mockResolvedValue(MEMBER);
});

describe("POST /api/calendar", () => {
  it("rejects a projectId that doesn't belong to the caller's org", async () => {
    getProjectByIdMock.mockResolvedValue(null);

    const res = await POST(
      postRequest({ projectId: "550e8400-e29b-41d4-a716-446655440000", type: "MEETING", title: "Sync", date: "2026-07-20" }),
    );

    expect(res.status).toBe(404);
    expect(createEventMock).not.toHaveBeenCalled();
  });

  it("creates the event when the project belongs to the caller's org", async () => {
    getProjectByIdMock.mockResolvedValue({ id: "550e8400-e29b-41d4-a716-446655440000", orgId: "org-A" });
    createEventMock.mockResolvedValue({ id: "event-1" });

    const res = await POST(
      postRequest({ projectId: "550e8400-e29b-41d4-a716-446655440000", type: "MEETING", title: "Sync", date: "2026-07-20" }),
    );

    expect(res.status).toBe(201);
    expect(createEventMock).toHaveBeenCalledTimes(1);
  });

  it("creates an org-wide event (no projectId) without checking any project", async () => {
    createEventMock.mockResolvedValue({ id: "event-2" });

    const res = await POST(postRequest({ type: "HOLIDAY", title: "Public holiday", date: "2026-08-31" }));

    expect(res.status).toBe(201);
    expect(getProjectByIdMock).not.toHaveBeenCalled();
  });
});
