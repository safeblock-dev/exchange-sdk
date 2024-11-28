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
      entry: "src/index.ts",
      // Name of the library (for UMD/IIFE builds)
      name: "ExchangeSdk",
      // Output file name without extension
      fileName: "index",
      // Target formats: CommonJS (`cjs`) and optionally others
      formats: [ "es", "cjs" ]
    },
    rollupOptions: {
      // Ensure external dependencies are not bundled into the library
      external: [ "@safeblock/blockchain-utils", "@ston-fi/sdk", "@ton/ton", "ethers" ],
      output: {
        // Configuration for CommonJS-specific output
        exports: "named"
      }
    }
  }
})