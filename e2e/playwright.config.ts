import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
