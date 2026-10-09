import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { WIBRAWL_HOSTNAME } from "../src/storefront-identity.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ command }) => ({
  root: appRoot,
  plugins: [{ name: "wibrawl-hostname", transformIndexHtml: html => html.replaceAll("__WIBRAWL_HOSTNAME__", WIBRAWL_HOSTNAME) }],
  base: "/",
  // The deployed asset directory also contains the shared Glamia favicon.
  // Serve it in Vite previews without copying the build output into itself.
  publicDir: command === "serve" ? fileURLToPath(new URL("../public", import.meta.url)) : false,
  build: {
    outDir: "../public",
    emptyOutDir: false,
    // The cleanup verifier follows Vite's complete chunk graph, including lazy routes.
    manifest: true,
  },
  server: {
    port: 5174,
  },
}));
