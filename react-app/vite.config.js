import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: appRoot,
  base: "/",
  build: {
    outDir: "../public",
    emptyOutDir: false,
  },
  server: {
    port: 5174,
  },
});
