import { seedOwnerSession } from "./seed";

export default async function globalSetup() {
  const info = await seedOwnerSession();
  console.log(`[e2e] seeded org "${info.orgName}" (${info.orgId}) with owner ${info.email}`);
}
