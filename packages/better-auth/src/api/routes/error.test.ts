import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("error page security", async () => {
	const { client } = await getTestInstance();

	it("should sanitize error description to prevent XSS", async () => {
		const attack = "<script>alert(1)</script>";
		const res = await client.$fetch(
			`/error?error=TEST&error_description=${encodeURIComponent(attack)}`,
			{
				method: "GET",
			},
		);

		const text = typeof res === "string" ? res : JSON.stringify(res);
		expect(text).not.toContain("<script>");
		expect(text).toContain("&lt;script&gt;");
	});

	it("should sanitize code parameter", async () => {
		const attack = "<script>";
		const res = await client.$fetch(
			`/error?error=${encodeURIComponent(attack)}`,
			{
				method: "GET",
			},
		);
		const text = typeof res === "string" ? res : JSON.stringify(res);
		// Invalid code defaults to UNKNOWN
		expect(text).toContain("UNKNOWN");
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/3875
 */
describe("error page custom errorURL", () => {
	it("merges into a configured errorURL that already has a query", async () => {
		const { client } = await getTestInstance({
			onAPIError: {
				errorURL: "/error?title=Invalid%20invite",
			},
		});
		await client.$fetch("/error?error=access_denied", {
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location") || "";
				expect(location.split("?").length - 1).toBe(1);
				const parsed = new URL(location, "http://localhost:3000");
				expect(parsed.searchParams.get("title")).toBe("Invalid invite");
				expect(parsed.searchParams.get("error")).toBe("access_denied");
			},
		});
	});

	it("redirects to exactly what errorUrlBuilder returns", async () => {
		const { client } = await getTestInstance({
			onAPIError: {
				errorURL: "/error",
				errorUrlBuilder: ({ error, baseURL }) => `${baseURL}/custom/${error}`,
			},
		});
		await client.$fetch("/error?error=access_denied", {
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				expect(context.response.headers.get("location")).toBe(
					"/error/custom/access_denied",
				);
			},
		});
	});
});
