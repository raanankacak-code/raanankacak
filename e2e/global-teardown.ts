import { teardownOwnerSession } from "./seed";

export default async function globalTeardown() {
  await teardownOwnerSession();
  console.log("[e2e] seeded org and owner user deleted");
}
