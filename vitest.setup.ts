import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Unmount whatever the last test rendered.
 *
 * Testing Library appends each render to document.body and does not remove it
 * on its own. Without this, a query like getByRole("button") starts matching
 * buttons left behind by earlier tests, and the failure looks like a bug in
 * the component rather than in the test file.
 *
 * Harmless in the node environment, where nothing has rendered.
 */
afterEach(() => {
  cleanup();
});
