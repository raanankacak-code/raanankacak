// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhotoStrip from "@/components/app/PhotoStrip";

const fetchMock = vi.fn();

function file(name = "a.png") {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

/** The upload input is hidden, so reach it by its accessible name. */
function input() {
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PhotoStrip", () => {
  it("renders each photo with a name describing what it is of", () => {
    render(<PhotoStrip label="the scaffold" photos={["/a.png", "/b.png"]} onChange={vi.fn()} />);

    expect(screen.getAllByAltText("the scaffold")).toHaveLength(2);
    expect(screen.getByLabelText(/add a photo to the scaffold/i)).toBeDefined();
  });

  it("removes the photo that was clicked, not the first one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhotoStrip label="site" photos={["/a.png", "/b.png", "/c.png"]} onChange={onChange} />);

    await user.click(screen.getAllByRole("button", { name: /remove photo/i })[1]);

    expect(onChange).toHaveBeenCalledWith(["/a.png", "/c.png"]);
  });

  it("reports every upload in one call, not one per file", async () => {
    // A call per file would read stale `photos` from the closure each time and
    // keep only the last — the exact bug this shape exists to avoid.
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "/1.png" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "/2.png" }) });
    const onChange = vi.fn();
    render(<PhotoStrip label="site" photos={["/existing.png"]} onChange={onChange} />);

    await userEvent.setup().upload(input(), [file("a.png"), file("b.png")]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["/existing.png", "/1.png", "/2.png"]);
  });

  it("hides the add control once the cap is reached", () => {
    render(<PhotoStrip label="site" max={2} photos={["/a.png", "/b.png"]} onChange={vi.fn()} />);

    expect(screen.queryByLabelText(/add a photo/i)).toBeNull();
  });

  it("takes only what fits and says so, rather than silently dropping the rest", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ url: "/1.png" }) });
    const onChange = vi.fn();
    render(<PhotoStrip label="site" max={2} photos={["/a.png"]} onChange={onChange} />);

    await userEvent.setup().upload(input(), [file("a.png"), file("b.png"), file("c.png")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["/a.png", "/1.png"]);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Only the first 1"));
  });

  it("surfaces the server's reason when an upload is refused", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "File too large" }) });
    const onChange = vi.fn();
    render(<PhotoStrip label="site" photos={[]} onChange={onChange} />);

    await userEvent.setup().upload(input(), file());

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "File too large");
    expect(onChange, "nothing was stored, so nothing should be reported").not.toHaveBeenCalled();
  });

  it("survives the network being down", async () => {
    fetchMock.mockRejectedValue(new Error("Failed to fetch"));
    render(<PhotoStrip label="site" photos={[]} onChange={vi.fn()} />);

    await userEvent.setup().upload(input(), file());

    expect(await screen.findByRole("alert")).toBeDefined();
  });

  it("hides the add control when disabled", () => {
    render(<PhotoStrip label="site" photos={[]} onChange={vi.fn()} disabled />);
    expect(screen.queryByLabelText(/add a photo/i)).toBeNull();
  });
});
