import { describe, expect, it } from "vitest";
import { matchesCaptchaEndpoint } from "./captcha";

const endpoints = [
	"/sign-up/email",
	"/sign-in/email",
	"/request-password-reset",
];
const pageURL = "https://app.test/auth/sign-in";

describe("matchesCaptchaEndpoint", () => {
	it("should match a form action resolved against the auth API base path", () => {
		expect(
			matchesCaptchaEndpoint(
				endpoints,
				"https://app.test/api/auth/sign-in/email",
				"https://app.test/api/auth",
				pageURL,
			),
		).toBe(true);
	});

	it("should match a base-path-relative action", () => {
		expect(
			matchesCaptchaEndpoint(endpoints, "/sign-in/email", "", pageURL),
		).toBe(true);
	});

	it("should match when the API base path has a trailing slash", () => {
		expect(
			matchesCaptchaEndpoint(
				endpoints,
				"https://app.test/api/auth/sign-up/email",
				"https://app.test/api/auth/",
				pageURL,
			),
		).toBe(true);
	});

	it("should match a custom API base path", () => {
		expect(
			matchesCaptchaEndpoint(
				endpoints,
				"https://app.test/custom/base/request-password-reset",
				"https://app.test/custom/base",
				pageURL,
			),
		).toBe(true);
	});

	it("should not match an unguarded endpoint", () => {
		expect(
			matchesCaptchaEndpoint(
				endpoints,
				"https://app.test/api/auth/sign-out",
				"https://app.test/api/auth",
				pageURL,
			),
		).toBe(false);
	});
});
