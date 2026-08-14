import { defineConfig } from "vitest/config";
import path from "node:path";

// The PDF mapper is rendered through the real react-pdf Node renderer, so the
// tests run in the node environment — not jsdom.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
