import { describe, expect, it } from "vitest";
import { isAuthPath } from "./svelte-kit";

describe("isAuthPath", () => {
	it("does not append the default base path twice when baseURL has a path", () => {
		expect(
			isAuthPath("https://app.example/custom/auth/sign-in/email", {
				baseURL: "https://app.example/custom/auth",
			}),
		).toBe(true);
	});

	it("uses a configured base path for origin-only base URLs", () => {
		expect(
			isAuthPath("https://app.example/custom/auth/sign-in/email", {
				baseURL: "https://app.example",
				basePath: "/custom/auth",
			}),
		).toBe(true);
	});
});
