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
