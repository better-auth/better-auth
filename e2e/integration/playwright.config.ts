import { defineConfig, devices } from "@playwright/test";

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
						use: { ...devices["Desktop Firefox"] },
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
