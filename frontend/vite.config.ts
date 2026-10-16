import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

// Dev: the browser talks to Vite, Vite forwards /api to the backend (API_URL, default local uvicorn).
const api = process.env.API_URL || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [vue()],
  server: { proxy: { "/api": api } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
