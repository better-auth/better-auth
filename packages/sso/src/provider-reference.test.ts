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
		expect(
			await isCurrentSSOProviderReference(
				{ ...provider, id: "provider-row-2" },
				reference,
			),
		).toBe(false);
	});

	it("rejects malformed state", () => {
		expect(parseSSOProviderReference({ providerId: "workforce" })).toBeNull();
	});
});
