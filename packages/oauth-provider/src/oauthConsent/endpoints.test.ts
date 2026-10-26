import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { sessionMiddleware } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it } from "vitest";
import * as z from "zod";
import { oauthProviderClient } from "../client";
import { oauthProvider } from "../oauth";
import type { OAuthConsent, Scope } from "../types";
import type { OAuthClient } from "../types/oauth";

describe("oauthConsent", async () => {
	const providerId = "test";
	const baseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
	const { auth, signInWithTestUser, customFetchImpl, db } =
		await getTestInstance({
			baseURL: baseUrl,
			plugins: [
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
				}),
				jwt(),
				{
					id: "createConsentTester",
					endpoints: {
						testerCreateConsent: createAuthEndpoint(
							"/server/oauth2/consent",
							{
								method: "POST",
								body: z.object({
									clientId: z.string(),
									scopes: z.array(z.string()),
									userId: z.string().optional(),
									referenceId: z.string().optional(),
								}),
								use: [sessionMiddleware],
								metadata: {
									SERVER_ONLY: true,
								},
							},
							async (ctx) => {
								const iat = Math.floor(Date.now() / 1000);
								return (await ctx.context.adapter.create({
									model: "oauthConsent",
									data: {
										createdAt: new Date(iat * 1000),
										updatedAt: new Date(iat * 1000),
										...ctx.body,
									},
								})) as OAuthConsent<Scope[]>;
							},
						),
					},
				} satisfies BetterAuthPlugin,
			],
		});
	const { headers, user } = await signInWithTestUser();
	const authClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let oauthClient1: OAuthClient;
	const oauthClient1Scopes = ["profile"];
	let oauthClient2: OAuthClient;
	const oauthClient2Scopes = ["openid", "profile"];
	let consent1: OAuthConsent<Scope[]>;
	let consent2: OAuthConsent<Scope[]>;

	beforeAll(async () => {
		const client1 = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
			},
		});
		expect(client1?.client_id).toBeDefined();
		expect(client1?.user_id).toBeDefined();
		expect(client1?.client_secret).toBeDefined();
		oauthClient1 = client1;

		const client2 = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				scope: oauthClient2Scopes.join(" "),
			},
		});
		expect(client2?.client_id).toBeDefined();
		expect(client2?.user_id).toBeDefined();
		expect(client2?.client_secret).toBeDefined();
		expect(client2?.scope).toBe(oauthClient2Scopes.join(" "));
		oauthClient2 = client2;
	});

	it("should create a tester consents", async () => {
		const _consent1 = await auth.api.testerCreateConsent({
			headers,
			body: {
				clientId: oauthClient1.client_id,
				userId: user.id,
				scopes: oauthClient1Scopes,
			},
		});
		expect(_consent1?.clientId).toBe(oauthClient1.client_id);
		expect(_consent1?.userId).toBe(user.id);
		expect(_consent1.scopes).toStrictEqual(oauthClient1Scopes);
		consent1 = _consent1;

		const _consent2 = await auth.api.testerCreateConsent({
			headers,
			body: {
				clientId: oauthClient2.client_id,
				userId: user.id,
				scopes: oauthClient2Scopes,
			},
		});
		expect(_consent2?.clientId).toBe(oauthClient2.client_id);
		expect(_consent2?.userId).toBe(user.id);
		expect(_consent2.scopes).toStrictEqual(oauthClient2Scopes);
		consent2 = _consent2;
	});

	it("should get a specific consent", async () => {
		const consent = await authClient.oauth2.getConsent({
			query: {
				id: consent1.id,
			},
		});
		expect(consent.data).toMatchObject(consent1);
	});

	it("should get user's consents", async () => {
		const consents = await authClient.oauth2.getConsents();
		expect(consents.data?.length).toBe(2);
		expect(consents.data).toStrictEqual([consent1, consent2]);
	});

	it("should not allow updates to scopes not granted to client", async () => {
		const consent = await authClient.oauth2.updateConsent({
			id: consent2.id,
			update: {
				scopes: ["email"],
			},
		});
		expect(consent.error?.status).toBe(400);
	});

	it("should allow scopes change to client", async () => {
		const consent = await authClient.oauth2.updateConsent({
			id: consent1.id,
			update: {
				scopes: ["email"],
			},
		});
		expect(consent.data?.scopes).toStrictEqual(["email"]);
		consent1 = consent.data!;
	});

	it("should reject updates to a consent owned by another user", async () => {
		const otherUser = await auth.api.signUpEmail({
			body: {
				email: "other-consent-owner@test.com",
				password: "password123",
				name: "Other Consent Owner",
			},
		});

		const otherConsent = await auth.api.testerCreateConsent({
			headers,
			body: {
				clientId: oauthClient1.client_id,
				userId: otherUser.user.id,
				scopes: oauthClient1Scopes,
			},
		});

		const res = await authClient.oauth2.updateConsent({
			id: otherConsent.id,
			update: { scopes: oauthClient1Scopes },
		});

		expect(res.error?.status).toBe(401);
	});
	it("should delete the consent and revoke associated tokens", async () => {
		const referenceId = "reference-1";
		const otherReferenceId = "reference-2";

		// Make consent1 correspond to referenceId.
		consent1 = await auth.api.testerCreateConsent({
			headers,
			body: {
				clientId: oauthClient1.client_id,
				userId: user.id,
				referenceId,
				scopes: oauthClient1Scopes,
			},
		});

		const refreshToken = await db.create({
			model: "oauthRefreshToken",
			data: {
				token: "test-refresh-token",
				clientId: oauthClient1.client_id,
				userId: user.id,
				referenceId,
				scopes: oauthClient1Scopes,
				expiresAt: new Date(Date.now() + 60 * 60 * 1000),
				createdAt: new Date(),
			},
		});

		const accessToken = await db.create({
			model: "oauthAccessToken",
			data: {
				token: "test-access-token",
				clientId: oauthClient1.client_id,
				userId: user.id,
				referenceId,
				refreshId: refreshToken.id,
				scopes: oauthClient1Scopes,
				expiresAt: new Date(Date.now() + 60 * 60 * 1000),
				createdAt: new Date(),
			},
		});

		// This access token has no refreshId. It must still be revoked.
		const standaloneAccessToken = await db.create({
			model: "oauthAccessToken",
			data: {
				token: "test-standalone-access-token",
				clientId: oauthClient1.client_id,
				userId: user.id,
				referenceId,
				scopes: oauthClient1Scopes,
				expiresAt: new Date(Date.now() + 60 * 60 * 1000),
				createdAt: new Date(),
			},
		});

		// Credentials belonging to another reference must survive.
		const otherRefreshToken = await db.create({
			model: "oauthRefreshToken",
			data: {
				token: "test-other-refresh-token",
				clientId: oauthClient1.client_id,
				userId: user.id,
				referenceId: otherReferenceId,
				scopes: oauthClient1Scopes,
				expiresAt: new Date(Date.now() + 60 * 60 * 1000),
				createdAt: new Date(),
			},
		});

		const otherAccessToken = await db.create({
			model: "oauthAccessToken",
			data: {
				token: "test-other-access-token",
				clientId: oauthClient1.client_id,
				userId: user.id,
				referenceId: otherReferenceId,
				refreshId: otherRefreshToken.id,
				scopes: oauthClient1Scopes,
				expiresAt: new Date(Date.now() + 60 * 60 * 1000),
				createdAt: new Date(),
			},
		});

		expect(refreshToken).toBeDefined();
		expect(accessToken).toBeDefined();
		expect(standaloneAccessToken).toBeDefined();
		expect(otherRefreshToken).toBeDefined();
		expect(otherAccessToken).toBeDefined();

		const consent = await authClient.oauth2.deleteConsent({
			id: consent1.id,
		});

		expect(consent.data).toBeNull();

		const afterRefreshTokens = await db.findMany<{ id: string }>({
			model: "oauthRefreshToken",
			where: [
				{ field: "clientId", value: oauthClient1.client_id },
				{ field: "userId", value: user.id },
			],
		});

		const afterAccessTokens = await db.findMany<{ id: string }>({
			model: "oauthAccessToken",
			where: [
				{ field: "clientId", value: oauthClient1.client_id },
				{ field: "userId", value: user.id },
			],
		});

		expect(afterRefreshTokens).toHaveLength(1);
		expect(afterRefreshTokens[0]?.id).toBe(otherRefreshToken.id);

		expect(afterAccessTokens).toHaveLength(1);
		expect(afterAccessTokens[0]?.id).toBe(otherAccessToken.id);
	});
});
