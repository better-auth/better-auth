import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "./src/index.ts",
    },
    splitting: false,
    sourcemap: true,
    format: ["esm", "cjs"],
    dts: true,
    external: ["zod"],
});
