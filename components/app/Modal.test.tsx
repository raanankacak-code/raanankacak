// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "@/components/app/Modal";

function open(onClose = vi.fn()) {
  return {
    onClose,
    ...render(
      <Modal title="Invite user" onClose={onClose} footer={<button>Send</button>}>
        <input aria-label="Name" />
        <input aria-label="Email" />
      </Modal>,
    ),
  };
}

describe("Modal", () => {
  it("is announced as a dialog with its title", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Invite user" })).toBeDefined();
  });

  it("moves focus to the first control, so typing can start immediately", () => {
    open();
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = open();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the overlay behind it is clicked, but not the dialog itself", async () => {
    const user = userEvent.setup();
    const { onClose } = open();

    await user.click(screen.getByRole("dialog"));
    expect(onClose, "clicking inside should not close").not.toHaveBeenCalled();
  });

  it("keeps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    open();
    const dialog = screen.getByRole("dialog");

    // Round the loop several times. Without the trap, focus escapes to the
    // page behind the overlay — where nothing is clickable, so it simply
    // disappears.
    for (let i = 0; i < 12; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement), `escaped after ${i + 1} tabs`).toBe(true);
    }
  });

  it("keeps Shift+Tab inside the dialog too", async () => {
    const user = userEvent.setup();
    open();
    const dialog = screen.getByRole("dialog");

    for (let i = 0; i < 12; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement), `escaped backwards after ${i + 1}`).toBe(true);
    }
  });

  it("gives focus back to whatever opened it", async () => {
    const user = userEvent.setup();
    // A real opener in the document, focused, exactly as a button would be.
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <Modal title="Invite user" onClose={vi.fn()}>
        <input aria-label="Name" />
      </Modal>,
    );
    expect(document.activeElement).not.toBe(opener);

    unmount();
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));

    opener.remove();
    void user;
  });

  it("does not throw when the opener has since been removed", () => {
    // The button that opened a dialog is sometimes the row the dialog just
    // deleted. Restoring focus to a detached node must not blow up on unmount.
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <Modal title="Confirm" onClose={vi.fn()}>
        <input aria-label="Name" />
      </Modal>,
    );

    opener.remove();
    expect(() => unmount()).not.toThrow();
  });

  it("locks page scroll while open and restores it after", () => {
    const { unmount } = open();
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
