import path from "node:path";

export function uploadsRoot() {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.UPLOADS_DIR || "./uploads",
  );
}
