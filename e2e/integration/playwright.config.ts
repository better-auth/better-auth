import { defineConfig, devices } from "@playwright/test";

// Firefox refuses to start as root when $HOME belongs to another user, which
// is how the CI runners run jobs.
const firefoxLaunchOptions =
	process.getuid?.() === 0
		? { launchOptions: { env: { ...process.env, HOME: "/root" } } }
		: {};

export default defineConfig({
	testMatch: "**/e2e/**/*.spec.ts",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	use: {
		trace: "on-first-retry",
	},

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		// Front-channel logout depends on each browser's third-party cookie
		// rules. CI sets PLAYWRIGHT_CROSS_BROWSER only when that code changes.
		...(process.env.PLAYWRIGHT_CROSS_BROWSER
			? [
					{
						name: "firefox",
						use: { ...devices["Desktop Firefox"], ...firefoxLaunchOptions },
						testMatch: "**/e2e/frontchannel-logout.spec.ts",
					},
					{
						name: "webkit",
						use: { ...devices["Desktop Safari"] },
						testMatch: "**/e2e/frontchannel-logout.spec.ts",
					},
				]
			: []),
	],
});
