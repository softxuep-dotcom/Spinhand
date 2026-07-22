import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/Spinhand/",
  server: {
    host: "0.0.0.0",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
