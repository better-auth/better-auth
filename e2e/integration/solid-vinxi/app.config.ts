import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
	ssr: false,
	/**
	 * Force a modern target so the bundler does not down-level destructuring.
	 * The default browser target lists Safari < 14.1 as unsupported, which has no
	 * transform and fails the build.
	 *
	 * @see https://github.com/evanw/esbuild/issues/4436
	 */
	vite: {
		build: { target: "esnext" },
		optimizeDeps: { esbuildOptions: { target: "esnext" } },
	},
});
