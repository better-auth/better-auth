import { describe, expect, it } from "vitest";
import { mergeErrorRedirectUrl, resolveErrorRedirectUrl } from "./error-url";

/**
 * @see https://github.com/better-auth/better-auth/issues/3875
 */
describe("mergeErrorRedirectUrl", () => {
	it("merges into a URL that already has a query without a second ?", () => {
		const url = mergeErrorRedirectUrl("/error?title=Invalid%20invite", {
			error: "access_denied",
			error_description: "user said no",
		});
		expect(url.split("?").length - 1).toBe(1);
		expect(url).not.toContain(" ");
		const parsed = new URL(url, "http://localhost:3000");
		expect(parsed.searchParams.get("title")).toBe("Invalid invite");
		expect(parsed.searchParams.get("error")).toBe("access_denied");
		expect(parsed.searchParams.get("error_description")).toBe("user said no");
	});

	it("does not overwrite an existing error key", () => {
		const url = mergeErrorRedirectUrl("/error?error=already", {
			error: "other",
			error_description: "nope",
		});
		const parsed = new URL(url, "http://localhost:3000");
		expect(parsed.searchParams.get("error")).toBe("already");
		expect(parsed.searchParams.get("error_description")).toBe("nope");
	});

	it("encodes values on an absolute URL", () => {
		const url = mergeErrorRedirectUrl("https://app.example/error", {
			error: "access_denied",
			error_description: "user said no",
		});
		expect(url).toContain("error_description=user+said+no");
		expect(url).not.toContain("user said no");
	});

	it("keeps an existing fragment", () => {
		const url = mergeErrorRedirectUrl("/error?title=hi#details", {
			error: "access_denied",
		});
		expect(url).toBe("/error?title=hi&error=access_denied#details");
	});

	it("overwrites protocol error params when requested", () => {
		const url = mergeErrorRedirectUrl(
			"https://app.example/cb?error=old",
			{ error: "access_denied", error_description: "nope" },
			{ overwrite: true },
		);
		const parsed = new URL(url);
		expect(parsed.searchParams.get("error")).toBe("access_denied");
		expect(parsed.searchParams.get("error_description")).toBe("nope");
	});
});

describe("resolveErrorRedirectUrl", () => {
	it("returns the builder result as the final URL without appending error", async () => {
		const url = await resolveErrorRedirectUrl(
			{
				onAPIError: {
					errorURL: "/error",
					errorUrlBuilder: ({ error, baseURL }) => `${baseURL}#${error}`,
				},
			},
			"/error?title=Invalid%20invite",
			{ error: "access_denied", error_description: "user said no" },
		);
		expect(url).toBe("/error?title=Invalid%20invite#access_denied");
		expect(url).not.toContain("error=");
	});

	it("falls back to a safe merge when no builder is configured", async () => {
		const url = await resolveErrorRedirectUrl(
			{ onAPIError: { errorURL: "/error" } },
			"/error?title=Invalid%20invite",
			{ error: "access_denied" },
		);
		expect(url).toContain("title=Invalid+invite");
		expect(url).toContain("error=access_denied");
	});

	it("lets the builder rename the query key and omit error=", async () => {
		const url = await resolveErrorRedirectUrl(
			{
				onAPIError: {
					errorUrlBuilder: ({ error, error_description, baseURL }) => {
						const parsed = new URL(baseURL, "http://localhost");
						parsed.searchParams.set("code", error);
						if (error_description) {
							parsed.searchParams.set("reason", error_description);
						}
						return `${parsed.pathname}${parsed.search}${parsed.hash}`;
					},
				},
			},
			"/error?title=Invalid%20invite",
			{ error: "access_denied", error_description: "user said no" },
		);
		expect(url.split("?").length - 1).toBe(1);
		expect(url).not.toContain("error=");
		const parsed = new URL(url, "http://localhost");
		expect(parsed.searchParams.get("title")).toBe("Invalid invite");
		expect(parsed.searchParams.get("code")).toBe("access_denied");
		expect(parsed.searchParams.get("reason")).toBe("user said no");
	});
});
