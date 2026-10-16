import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  // PW_CHROMIUM: path to an already-installed Chromium, if `npx playwright install chromium` is not wanted.
  use: { baseURL: "http://127.0.0.1:5174", launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined } },
  webServer: [
    { command: "node e2e/fake-api.ts", url: "http://127.0.0.1:8787/api/competitions", reuseExistingServer: true },
    {
      command: "npx vite --port 5174 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:5174",
      env: { API_URL: "http://127.0.0.1:8787" },
      reuseExistingServer: true,
    },
  ],
});
