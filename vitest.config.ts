import * as path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    testTimeout: 30_000
  },
  resolve: {
    alias: [
      { find: "~", replacement: path.resolve(__dirname, "./src/") }
    ]
  }
})