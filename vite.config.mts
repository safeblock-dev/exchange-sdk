import * as path from "node:path"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"
import dts from "vite-plugin-dts"

// Vite configuration
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    dts({
      entryRoot: "src",
      outDir: "dist",
      exclude: [ "__specs__/**" ]
    })
  ],
  build: {
    lib: {
      // Entry point of your library
      entry: {
        "exchange-sdk": path.resolve(__dirname, "src/index.ts"),
        "extensions": path.resolve(__dirname, "src/extensions/index.ts"),
        "utils": path.resolve(__dirname, "src/utils/index.ts"),
      },
      // Name of the library (for UMD/IIFE builds)
      name: "ExchangeSdk",
      // Output file name without extension
      // Target formats: CommonJS (`cjs`) and optionally others
      formats: [ "es", "cjs" ]
    },
    rollupOptions: {
      // Ensure external dependencies are not bundled into the library
      external: [ "@safeblock/blockchain-utils", "ethers" ],
      output: {
        // Configuration for CommonJS-specific output
        exports: "named"
      }
    }
  }
})