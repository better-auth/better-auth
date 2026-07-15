import { describe, expect, it } from "vitest";
import type { ResolvedSSOProvider } from "./provider-instance";
import {
	createConfiguredSSOProviderInstance,
	createPersistedSSOProviderInstance,
	getSSOProviderReference,
	isCurrentSSOProviderReference,
	parseSSOProviderReference,
	resolveSSOIdentityIssuer,
} from "./provider-instance";

function createOIDCProvider(
	options: {
		clientSecret?: string;
		configured?: boolean;
		scopes?: string[];
	} = {},
): ResolvedSSOProvider {
	return {
		providerId: "workforce",
		userId: "provider-owner",
		domain: "example.com",
		issuer: "https://idp.example.com",
		instance: options.configured
			? createConfiguredSSOProviderInstance("workforce")
			: createPersistedSSOProviderInstance("provider-record-id"),
		oidcConfig: {
			issuer: "https://idp.example.com",
			pkce: true,
			clientId: "workforce-client",
			clientSecret: options.clientSecret ?? "client-secret",
			discoveryEndpoint:
				"https://idp.example.com/.well-known/openid-configuration",
			scopes: options.scopes ?? ["openid", "email", "profile"],
		},
	};
}

function createSAMLProvider(secretSuffix: string): ResolvedSSOProvider {
	return {
		providerId: "workforce-saml",
		userId: "provider-owner",
		domain: "example.com",
		issuer: "https://sp.example.com",
		instance: createPersistedSSOProviderInstance("saml-provider-record-id"),
		samlConfig: {
			issuer: "https://sp.example.com",
			entryPoint: "https://idp.example.com/sso",
			cert: "public-signing-certificate",
			idpMetadata: {
				entityID: "https://idp.example.com",
				privateKey: `idp-private-key-${secretSuffix}`,
				privateKeyPass: `idp-private-key-pass-${secretSuffix}`,
				encPrivateKey: `idp-encryption-key-${secretSuffix}`,
				encPrivateKeyPass: `idp-encryption-key-pass-${secretSuffix}`,
			},
			spMetadata: {
				privateKey: `sp-private-key-${secretSuffix}`,
				privateKeyPass: `sp-private-key-pass-${secretSuffix}`,
				encPrivateKey: `sp-encryption-key-${secretSuffix}`,
				encPrivateKeyPass: `sp-encryption-key-pass-${secretSuffix}`,
			},
			privateKey: `request-signing-key-${secretSuffix}`,
		},
	};
}

describe("SSO provider instances", () => {
	it("keeps persisted OIDC identities scoped to their immutable instance", () => {
		const instance = createPersistedSSOProviderInstance("provider-record-id");
		expect(
			resolveSSOIdentityIssuer(
				{ instance },
				"oidc",
				"https://claimed-issuer.example.com",
			),
		).toBe("sso:provider:provider-record-id:oidc");
	});

	it("shares a verified OIDC authority only for server-configured providers", () => {
		const instance = createConfiguredSSOProviderInstance("workforce");
		expect(
			resolveSSOIdentityIssuer(
				{ instance },
				"oidc",
				"https://verified-issuer.example.com",
			),
		).toBe("https://verified-issuer.example.com");
	});

	it("round-trips only valid provider-instance references", async () => {
		const provider = createOIDCProvider();
		const reference = await getSSOProviderReference(provider, "oidc");

		expect(parseSSOProviderReference(reference)).toEqual(reference);
		expect(
			await isCurrentSSOProviderReference(provider, reference, "oidc"),
		).toBe(true);
		expect(
			await isCurrentSSOProviderReference(
				provider,
				{
					...reference,
					providerInstanceId: "sso:provider:replacement-record-id",
				},
				"oidc",
			),
		).toBe(false);
		expect(
			parseSSOProviderReference({
				providerId: "workforce",
				providerInstanceId: "sso:provider:",
				authenticationConfigurationFingerprint: "fingerprint",
			}),
		).toBeNull();
		expect(
			parseSSOProviderReference({
				providerId: "workforce",
				providerInstanceId: "github",
				authenticationConfigurationFingerprint: "fingerprint",
			}),
		).toBeNull();
		expect(
			parseSSOProviderReference({
				providerId: "workforce",
				providerInstanceId: "sso:provider:provider-record-id",
			}),
		).toBeNull();
	});

	it("rejects an OIDC reference after non-secret configuration changes", async () => {
		const provider = createOIDCProvider();
		const reference = await getSSOProviderReference(provider, "oidc");
		const reconfiguredProvider = createOIDCProvider({
			scopes: ["openid", "email", "groups"],
		});

		expect(
			await isCurrentSSOProviderReference(
				reconfiguredProvider,
				reference,
				"oidc",
			),
		).toBe(false);
	});

	it("does not derive an OIDC fingerprint from the client secret", async () => {
		const originalReference = await getSSOProviderReference(
			createOIDCProvider({ clientSecret: "original-secret" }),
			"oidc",
		);
		const rotatedReference = await getSSOProviderReference(
			createOIDCProvider({ clientSecret: "rotated-secret" }),
			"oidc",
		);

		expect(rotatedReference.authenticationConfigurationFingerprint).toBe(
			originalReference.authenticationConfigurationFingerprint,
		);
	});

	it("does not derive a SAML fingerprint from private keys or passphrases", async () => {
		const originalReference = await getSSOProviderReference(
			createSAMLProvider("original"),
			"saml",
		);
		const rotatedReference = await getSSOProviderReference(
			createSAMLProvider("rotated"),
			"saml",
		);

		expect(rotatedReference.authenticationConfigurationFingerprint).toBe(
			originalReference.authenticationConfigurationFingerprint,
		);
	});

	it("keeps configured providers current while their configuration matches", async () => {
		const provider = createOIDCProvider({ configured: true });
		const reference = await getSSOProviderReference(provider, "oidc");

		expect(
			await isCurrentSSOProviderReference(provider, reference, "oidc"),
		).toBe(true);
	});
});
