import { defineConfig } from "tsdown";

/**
 * Dedicated bundle for the browser UI runtime served at `/_ba/runtime.js`.
 *
 * This is intentionally separate from the main `tsdown.config.ts` (which uses
 * `unbundle: true`). The runtime entry and everything it imports
 * (`src/ui/runtime/**`, including `@simplewebauthn/browser`) are bundled into a
 * single browser IIFE. `scripts/build-runtime.mjs` then inlines the emitted
 * file into `src/ui/runtime.generated.ts` as the `uiRuntime` string.
 *
 * Keep `minify: false` so the substring assertions in
 * `src/ui/router.test.ts` continue to match the served runtime.
 */
export default defineConfig({
	entry: ["src/ui/runtime/index.ts"],
	format: ["iife"],
	// Required for the iife format. The runtime is side-effect only (it just
	// registers DOM listeners), so this global is never read.
	globalName: "__baUiRuntime",
	platform: "browser",
	target: "es2020",
	minify: false,
	dts: false,
	clean: true,
	outDir: "dist-runtime",
});
