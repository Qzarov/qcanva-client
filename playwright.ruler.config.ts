import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "canvas-ruler.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
    baseURL: "http://127.0.0.1:4199",
    locale: "en-US",
  },
  webServer: [
    {
      command: "node --experimental-strip-types tests/support/ruler-server.ts",
      url: "http://127.0.0.1:3199/__test/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4199 --strictPort",
      url: "http://127.0.0.1:4199",
      env: { VITE_API_URL: "http://127.0.0.1:3199/api" },
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
