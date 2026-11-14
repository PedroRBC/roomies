import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import { Agent } from "node:https";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    proxy: {
      "/api": {
        xfwd: true,
        target: process.env.ROOMIES_DEV_API_URL ?? "https://backend:8080",
        ...(process.env.ROOMIES_DEV_CA_FILE
          ? {
              agent: new Agent({
                ca: readFileSync(process.env.ROOMIES_DEV_CA_FILE),
              }),
            }
          : {}),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    restoreMocks: true,
  },
});
