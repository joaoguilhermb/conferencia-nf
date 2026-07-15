import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Express } from "express";
import express from "express";

/**
 * Registers static file serving for the frontend Vite build output.
 * Only called in production (NODE_ENV === "production").
 *
 * The frontend is built to:
 *   artifacts/conferencia-nf/dist/public
 *
 * At runtime the bundled server lives at:
 *   artifacts/api-server/dist/index.mjs
 *
 * So the relative path from the dist folder to the frontend dist is:
 *   ../../conferencia-nf/dist/public
 */
export function serveStatic(app: Express) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // When running from the compiled output (artifacts/api-server/dist/),
  // the frontend build output is two levels up then into conferencia-nf/dist/public.
  const publicDir = path.resolve(
    __dirname,
    "..",
    "..",
    "conferencia-nf",
    "dist",
    "public",
  );

  // Serve all static assets (JS, CSS, images, etc.)
  app.use(express.static(publicDir));

  // SPA fallback: any request that didn't match /api or a static file
  // gets the index.html so client-side routing works correctly.
  // app.get("*", ...) is intentionally avoided here because Express 5 uses
  // path-to-regexp v8 which rejects bare "*" wildcards (PathError).
  // app.use without a path is the correct Express 5 catch-all.
  app.use((_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}
