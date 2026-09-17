import { describe, expect, it } from "vitest";
import {
	computeSSOProviderReference,
	isCurrentSSOProviderReference,
	parseSSOProviderReference,
} from "./provider-reference";
import type { SSOOptions, SSOProvider } from "./types";

function configuredProvider(clientSecret = "secret") {
	return {
		issuer: "https://idp.example.com",
		providerId: "workforce",
		userId: "default",
		domain: "example.com",
		oidcConfig: {
			issuer: "https://idp.example.com",
			clientId: "workforce-client",
			clientSecret,
			pkce: false,
			discoveryEndpoint:
				"https://idp.example.com/.well-known/openid-configuration",
			authorizationEndpoint: "https://idp.example.com/authorize",
			tokenEndpoint: "https://idp.example.com/token",
			jwksEndpoint: "https://idp.example.com/jwks",
		},
	} satisfies SSOProvider<SSOOptions>;
}

function configuredSAMLProvider(privateKey = "private-key") {
	return {
		issuer: "https://service.example.com/saml",
		providerId: "workforce-saml",
		userId: "default",
		domain: "example.com",
		samlConfig: {
			issuer: "https://service.example.com/saml",
			entryPoint: "https://idp.example.com/sso",
			cert: "idp-signing-certificate",
			privateKey,
			idpMetadata: {
				entityID: "https://idp.example.com/metadata",
				cert: "idp-signing-certificate",
				privateKey,
				privateKeyPass: "private-key-password",
				encPrivateKey: "encryption-private-key",
				encPrivateKeyPass: "encryption-private-key-password",
			},
			spMetadata: {
				entityID: "https://service.example.com/saml",
				privateKey,
				privateKeyPass: "private-key-password",
				encPrivateKey: "encryption-private-key",
				encPrivateKeyPass: "encryption-private-key-password",
			},
		},
	} satisfies SSOProvider<SSOOptions>;
}

describe("SSO provider references", () => {
	it("binds state to non-secret authentication configuration", async () => {
		const reference = await computeSSOProviderReference(configuredProvider());
		expect(
			await isCurrentSSOProviderReference(
				configuredProvider("rotated-secret"),
				reference,
			),
		).toBe(true);
		expect(
			await isCurrentSSOProviderReference(
				{
					...configuredProvider(),
					oidcConfig: {
						...configuredProvider().oidcConfig,
						tokenEndpoint: "https://attacker.example/token",
					},
				},
				reference,
			),
		).toBe(false);
	});

	it("binds persisted providers to the same database row", async () => {
		const provider = {
			...configuredProvider(),
			id: "provider-row-1",
			userId: "default",
		};
		const reference = await computeSSOProviderReference(provider);
		expect(reference.source).toEqual({
			type: "persisted",
			recordId: "provider-row-1",
		});
		expect(await isCurrentSSOProviderReference(provider, reference)).toBe(true);
		expect(
			await isCurrentSSOProviderReference(
				{ ...provider, id: "provider-row-2" },
				reference,
			),
		).toBe(false);
	});

	it("binds SAML state to authentication configuration without private keys", async () => {
		const reference = await computeSSOProviderReference(
			configuredSAMLProvider(),
		);
		const rotatedPrivateKeys = configuredSAMLProvider("rotated-private-key");
		rotatedPrivateKeys.samlConfig.idpMetadata.privateKey =
			"rotated-idp-private-key";
		rotatedPrivateKeys.samlConfig.idpMetadata.privateKeyPass =
			"rotated-idp-private-key-password";
		rotatedPrivateKeys.samlConfig.idpMetadata.encPrivateKey =
			"rotated-idp-encryption-private-key";
		rotatedPrivateKeys.samlConfig.idpMetadata.encPrivateKeyPass =
			"rotated-idp-encryption-private-key-password";
		rotatedPrivateKeys.samlConfig.spMetadata.privateKey =
			"rotated-sp-private-key";
		rotatedPrivateKeys.samlConfig.spMetadata.privateKeyPass =
			"rotated-sp-private-key-password";
		rotatedPrivateKeys.samlConfig.spMetadata.encPrivateKey =
			"rotated-sp-encryption-private-key";
		rotatedPrivateKeys.samlConfig.spMetadata.encPrivateKeyPass =
			"rotated-sp-encryption-private-key-password";

		expect(
			await isCurrentSSOProviderReference(rotatedPrivateKeys, reference),
		).toBe(true);
		expect(
			await isCurrentSSOProviderReference(
				{
					...configuredSAMLProvider(),
					samlConfig: {
						...configuredSAMLProvider().samlConfig,
						entryPoint: "https://attacker.example.com/sso",
					},
				},
				reference,
			),
		).toBe(false);
		expect(
			await isCurrentSSOProviderReference(
				{
					...configuredSAMLProvider(),
					samlConfig: {
						...configuredSAMLProvider().samlConfig,
						cert: "replacement-signing-certificate",
					},
				},
				reference,
			),
		).toBe(false);
	});

	it("rejects malformed state", () => {
		expect(parseSSOProviderReference({ providerId: "workforce" })).toBeNull();
	});
});
