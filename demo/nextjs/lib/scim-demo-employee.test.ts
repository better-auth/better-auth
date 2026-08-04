import type {
	SSOUserResolutionContext,
	SSOUserResolutionInput,
} from "@better-auth/sso";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	resolveSCIMDemoSSOUser,
	SCIM_DEMO_CONNECTION_ID_CLAIM,
} from "./scim-demo-employee.ts";
import {
	createSCIMDemoV2Subject,
	getSCIMDemoOIDCIssuer,
	SCIM_DEMO_SSO_PROVIDER_ID,
} from "./scim-demo-identity.ts";

describe("resolveSCIMDemoSSOUser", () => {
	beforeEach(() => {
		process.env.BETTER_AUTH_SECRET =
			"better-auth-scim-demo-identity-test-secret";
		process.env.BETTER_AUTH_URL = "http://localhost:3000";
	});

	it("uses only the verified ID Token claim for the SCIM connection binding", async () => {
		const verifiedConnectionId = `ba_scim_connection_${"a".repeat(32)}`;
		const userInfoConnectionId = `ba_scim_connection_${"b".repeat(32)}`;
		const subject = await createSCIMDemoV2Subject(
			verifiedConnectionId,
			"maya-chen",
		);
		const findOne = vi.fn().mockResolvedValue(null);
		const input = {
			protocol: "oidc",
			providerId: SCIM_DEMO_SSO_PROVIDER_ID,
			accountKey: {
				issuer: getSCIMDemoOIDCIssuer(),
				accountId: subject,
			},
			providerUser: {
				email: "alex@acme.example",
				emailVerified: true,
				name: "Alex",
			},
			providerReference: {
				providerId: SCIM_DEMO_SSO_PROVIDER_ID,
				source: { type: "configured" },
				authenticationConfigurationFingerprint: "test-fingerprint",
			},
			providerClaims: {
				[SCIM_DEMO_CONNECTION_ID_CLAIM]: userInfoConnectionId,
			},
			verifiedIdTokenClaims: {
				[SCIM_DEMO_CONNECTION_ID_CLAIM]: verifiedConnectionId,
			},
		} satisfies SSOUserResolutionInput;

		await resolveSCIMDemoSSOUser(input, {
			database: { findOne },
		} as unknown as SSOUserResolutionContext);

		expect(findOne).toHaveBeenCalledWith({
			model: "scimManagedConnection",
			where: [{ field: "connectionId", value: verifiedConnectionId }],
		});
		expect(findOne).not.toHaveBeenCalledWith({
			model: "scimManagedConnection",
			where: [{ field: "connectionId", value: userInfoConnectionId }],
		});
	});

	it("rejects non-OIDC resolution input before querying a connection", async () => {
		const findOne = vi.fn().mockResolvedValue(null);
		const resolution = await resolveSCIMDemoSSOUser(
			{
				protocol: "saml",
				providerId: SCIM_DEMO_SSO_PROVIDER_ID,
				accountKey: {
					issuer: getSCIMDemoOIDCIssuer(),
					accountId: "scim-demo:v2:invalid",
				},
				providerUser: {
					email: "alex@acme.example",
					emailVerified: true,
					name: "Alex",
				},
				providerReference: {
					providerId: SCIM_DEMO_SSO_PROVIDER_ID,
					source: { type: "configured" },
					authenticationConfigurationFingerprint: "test-fingerprint",
				},
				providerAttributes: {},
			},
			{
				database: { findOne },
			} as unknown as SSOUserResolutionContext,
		);

		expect(resolution).toMatchObject({
			action: "reject",
			code: "SCIM_DEMO_SSO_REJECTED",
		});
		expect(findOne).not.toHaveBeenCalled();
	});
});
