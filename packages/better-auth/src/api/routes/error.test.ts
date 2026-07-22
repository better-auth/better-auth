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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9681
	 */
	it("should generate valid documentation URLs for error codes with apostrophes", async () => {
		// cspell:disable-next-line
		const errorCode = "email_doesn't_match";
		const res = await client.$fetch(
			`/error?error=${encodeURIComponent(errorCode)}`,
			{
				method: "GET",
			},
		);

		const text = typeof res === "string" ? res : JSON.stringify(res);
		// cspell:disable
		// The error code should be displayed with the apostrophe (as HTML entity)
		expect(text).toContain("email_doesn&#39;t_match");
		// The documentation URL should have apostrophe removed for valid routing
		expect(text).toContain(
			"https://better-auth.com/docs/reference/errors/email_doesnt_match",
		);
		// Should NOT contain the apostrophe in the URL path
		expect(text).not.toContain(
			"https://better-auth.com/docs/reference/errors/email_doesn%27t_match",
		);
		// cspell:enable
	});
});
