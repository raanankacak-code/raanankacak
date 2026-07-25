import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();
const removeMock = vi.fn();
const listMock = vi.fn();
const warnMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: warnMock, info: vi.fn(), error: vi.fn() },
  errorFields: () => ({}),
}));

const { objectNameFromUrl, removeObjectsByUrl, sumStorageBytesForOrg } = await import("@/lib/uploads");

beforeEach(() => {
  createAdminClientMock.mockReset();
  removeMock.mockReset();
  listMock.mockReset();
  warnMock.mockReset();

  removeMock.mockResolvedValue({ error: null });
  listMock.mockResolvedValue({ data: [], error: null });
  createAdminClientMock.mockReturnValue({
    storage: { from: () => ({ remove: removeMock, list: listMock }) },
  });
});

describe("objectNameFromUrl", () => {
  it("extracts the filename from the org's own upload URL", () => {
    expect(objectNameFromUrl("org-A", "/api/uploads/org-A/abc.png")).toBe("abc.png");
  });

  it("refuses a URL pointing at another org's folder", () => {
    // The URL comes from a database row. If a crafted value could name
    // another org's object, deleting your own document would delete their
    // file — so the org must match, not just be present.
    expect(objectNameFromUrl("org-A", "/api/uploads/org-B/abc.png")).toBeNull();
  });

  it("ignores external and non-upload URLs", () => {
    expect(objectNameFromUrl("org-A", "https://example.com/logo.png")).toBeNull();
    expect(objectNameFromUrl("org-A", "/api/projects/org-A/abc.png")).toBeNull();
    expect(objectNameFromUrl("org-A", "")).toBeNull();
  });

  it("refuses nested or traversal-shaped paths", () => {
    expect(objectNameFromUrl("org-A", "/api/uploads/org-A/../org-B/x.png")).toBeNull();
    expect(objectNameFromUrl("org-A", "/api/uploads/org-A/nested/x.png")).toBeNull();
    expect(objectNameFromUrl("org-A", "/api/uploads/org-A/..")).toBeNull();
  });
});

describe("removeObjectsByUrl", () => {
  it("removes only the org's own objects, silently skipping the rest", async () => {
    await removeObjectsByUrl("org-A", [
      "/api/uploads/org-A/one.png",
      "/api/uploads/org-B/other.png",
      "https://example.com/x.png",
      null,
      undefined,
      "",
    ]);

    expect(removeMock).toHaveBeenCalledWith(["org-A/one.png"]);
  });

  it("does not call storage at all when nothing is deletable", async () => {
    await removeObjectsByUrl("org-A", ["https://example.com/x.png", null]);

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("logs but does not throw when storage removal fails", async () => {
    // The row is already gone and the user's delete succeeded — failing here
    // would report an error for an action that did happen.
    removeMock.mockResolvedValue({ error: { message: "storage down" } });

    await expect(removeObjectsByUrl("org-A", ["/api/uploads/org-A/one.png"])).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalled();
  });
});

describe("sumStorageBytesForOrg", () => {
  it("sums the sizes of the org's objects", async () => {
    listMock.mockResolvedValue({
      data: [{ metadata: { size: 100 } }, { metadata: { size: 250 } }],
      error: null,
    });

    expect(await sumStorageBytesForOrg("org-A")).toBe(350);
  });

  it("returns 0 for an org that has never uploaded anything", async () => {
    expect(await sumStorageBytesForOrg("org-A")).toBe(0);
  });

  it("pages through more than one batch instead of stopping at the first", async () => {
    const full = Array.from({ length: 100 }, () => ({ metadata: { size: 10 } }));
    listMock
      .mockResolvedValueOnce({ data: full, error: null })
      .mockResolvedValueOnce({ data: [{ metadata: { size: 7 } }], error: null });

    expect(await sumStorageBytesForOrg("org-A")).toBe(1007);
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("tolerates an object with no size metadata", async () => {
    listMock.mockResolvedValue({ data: [{ metadata: {} }, { metadata: { size: 5 } }], error: null });

    expect(await sumStorageBytesForOrg("org-A")).toBe(5);
  });

  it("propagates a listing error instead of under-reporting usage", async () => {
    // Silently returning 0 here would quietly disable the quota check.
    listMock.mockResolvedValue({ data: null, error: new Error("list failed") });

    await expect(sumStorageBytesForOrg("org-A")).rejects.toThrow("list failed");
  });
});
