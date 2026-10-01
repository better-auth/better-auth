import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		clearMocks: true,
		restoreMocks: true,
		// CLI tests are integration-style: they spawn the built CLI as a
		// subprocess and transpile config files (babel + jiti, importing
		// better-auth and adapters). That runs in seconds locally but is sensitive
		// to CI runner load, so the default 5s timeout flakes. Give the whole suite
		// a generous ceiling instead of scattering per-test overrides.
		testTimeout: 60_000,
		hookTimeout: 60_000,
	},
});
