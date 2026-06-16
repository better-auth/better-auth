import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("error page security", async () => {
	const { auth } = await getTestInstance();

	it("should render sanitized error description from the UI handler", async () => {
		const attack = "<script>alert(1)</script>";
		const res = await auth.ui.handler(
			new Request(
				`http://localhost:3000/auth/error?error=TEST&error_description=${encodeURIComponent(attack)}`,
			),
		);
		const text = await res.text();

		expect(text).not.toContain("<script>");
		expect(text).toContain("&lt;script&gt;");
	});

	it("should sanitize code parameter from the UI handler", async () => {
		const attack = "<script>";
		const res = await auth.ui.handler(
			new Request(
				`http://localhost:3000/auth/error?error=${encodeURIComponent(attack)}`,
			),
		);
		const text = await res.text();
		// Invalid code defaults to UNKNOWN
		expect(text).toContain("UNKNOWN");
	});

	it("should render recovery actions on the UI error page", async () => {
		const res = await auth.ui.handler(
			new Request(
				"http://localhost:3000/auth/error?error=INVALID_CALLBACK_URL",
			),
		);
		const text = await res.text();

		expect(text).toContain("Something Went Wrong");
		expect(text).toContain("INVALID_CALLBACK_URL");
		expect(text).toContain("Try again");
		expect(text).toContain('href="./sign-in"');
		expect(text).toContain("Open Error Reference");
	});

	it("should redirect the API error route to the UI error route", async () => {
		const res = await auth.handler(
			new Request("http://localhost:3000/api/auth/error?error=TEST", {
				redirect: "manual",
			}),
		);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(
			"http://localhost:3000/auth/error?error=TEST",
		);
	});
});
