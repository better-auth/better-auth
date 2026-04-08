import { describe, expect, it } from "vitest";
import { memoryAdapter } from "../../better-auth/src/adapters/memory-adapter";
import { createAuthClient } from "../../better-auth/src/client/index";
import { setCookieToHeader } from "../../better-auth/src/cookies/index";
import { betterAuth } from "../../better-auth/src/index";
import { bearer } from "../../better-auth/src/plugins/bearer/index";
import { organizationClient } from "../../better-auth/src/plugins/organization/client";
import { organization } from "../../better-auth/src/plugins/organization/index";
import { sso } from ".";
import { ssoClient } from "./client";

describe("SSO Organization Isolation E2E", async () => {
	const createTestAuth = () => {
		const data: Record<string, any[]> = {
			user: [],
			session: [],
			account: [],
			ssoProvider: [],
			member: [],
			organization: [],
			invitation: [],
			team: [],
			teamMember: [],
			orgRole: [],
			verification: [],
		};
		const memory = memoryAdapter(data);

		const auth = betterAuth({
			database: memory,
			baseURL: "http://localhost:3000",
			emailAndPassword: { enabled: true },
			session: {
				additionalFields: {
					sso_organization_id: { type: "string" }, // Add both just in case
					ssoOrganizationId: { type: "string" },
				},
			},
			plugins: [
				bearer(),
				sso({
					domainVerification: { enabled: true },
				}),
				organization({
					teams: { enabled: true },
				}),
			],
		});

		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [
				bearer(),
				ssoClient({ domainVerification: { enabled: true } }),
				organizationClient({ teams: { enabled: true } }),
			],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});

		return { auth, authClient, data };
	};

	it("Step-by-Step Isolation Verification", async () => {
		const { auth, authClient, data } = createTestAuth();
		const headers = new Headers();

		// 1. Setup Organizations and User
		const signUpRes = await authClient.signUp.email(
			{
				email: "owner@example.com",
				password: "password123",
				name: "Owner",
			},
			{
				onSuccess: setCookieToHeader(headers),
			},
		);
		const userId = signUpRes.data?.user.id!;

		const orgARes = await auth.api.createOrganization({
			body: { name: "Org A", slug: "org-a" },
			headers,
		});
		const orgIdA = orgARes?.id!;

		const orgBRes = await auth.api.createOrganization({
			body: { name: "Org B", slug: "org-b" },
			headers,
		});
		const orgIdB = orgBRes?.id!;

		// 2. Register SSO Providers for both Orgs
		const _providerARes = await auth.api.registerSSOProvider({
			body: {
				providerId: "provider-a",
				issuer: "http://idp-a.com",
				domain: "example-a.com",
				organizationId: orgIdA,
				samlConfig: {
					entryPoint: "http://idp-a.com/sso",
					cert: "cert",
					callbackUrl: "http://localhost:3000/sso/callback/provider-a",
					spMetadata: {},
				},
			},
			headers,
		});

		const _providerBRes = await auth.api.registerSSOProvider({
			body: {
				providerId: "provider-b",
				issuer: "http://idp-b.com",
				domain: "example-b.com",
				organizationId: orgIdB,
				samlConfig: {
					entryPoint: "http://idp-b.com/sso",
					cert: "cert",
					callbackUrl: "http://localhost:3000/sso/callback/provider-b",
					spMetadata: {},
				},
			},
			headers,
		});

		// 3. Simulate SSO-scoped session for Org A
		const sessionToken = "sso-token-org-a";
		data.session!.push({
			id: "sso-session-id",
			token: sessionToken,
			userId: userId,
			expiresAt: new Date(Date.now() + 1000 * 60 * 60),
			createdAt: new Date(),
			userAgent: "test",
			ipAddress: "127.0.0.1",
			ssoOrganizationId: orgIdA, // Scope to Org A
		});

		const ssoHeaders = new Headers();
		ssoHeaders.set("Authorization", `Bearer ${sessionToken}`);

		// DEBUG: Check session
		const _sessionRes = await auth.api.getSession({
			headers: ssoHeaders,
		});

		/**
		 * STEP 1: List Filtering
		 */
		const listResServer = await auth.api.listOrganizations({
			headers: ssoHeaders,
		});
		console.info("E2E DEBUG: Server-side list length:", listResServer?.length);
		if (listResServer?.length !== 1) {
			console.error(
				"DEBUG: Server-side list failed. Orgs:",
				JSON.stringify(listResServer),
			);
		}

		const listRes = await (authClient as any).organization.list({
			fetchOptions: { headers: ssoHeaders },
		});
		if (listRes.error) {
			throw new Error(`List failed: ${JSON.stringify(listRes.error)}`);
		}
		expect(listRes.data?.length).toBe(1);
		expect(listRes.data?.[0].id).toBe(orgIdA);
		console.log("✓ Step 1: listOrganizations filtered correctly.");

		/**
		 * STEP 2: Cross-Tenant Resource Access (Team)
		 */
		/**
		 * STEP 2: Access Control (Team Update)
		 */
		const teamB = await auth.api.createTeam({
			body: { name: "Org B Team", organizationId: orgIdB },
			headers,
		});
		const teamIdB = teamB.id;

		const updateTeamRes = await (authClient as any).organization.updateTeam({
			teamId: teamIdB,
			data: { name: "Org B Team Updated", organizationId: orgIdB }, // Explicitly targeting Org B
			fetchOptions: { headers: ssoHeaders },
		});
		expect(updateTeamRes.error?.status).toBe(403);
		console.log(
			"✓ Step 2: Access to Org B teams from Org A session blocked (403)",
		);

		/**
		 * STEP 3: SSO Plugin Isolation (Provider Management)
		 */
		// Create a provider in Org B using the API (as owner)
		await auth.api.registerSSOProvider({
			body: {
				providerId: "provider-b-isolated",
				issuer: "http://example-b.com",
				domain: "example-b.com",
				organizationId: orgIdB,
				samlConfig: {
					entryPoint: "http://example-b.com/sso",
					cert: "cert",
					callbackUrl: "http://localhost:3000/sso/callback/provider-b-isolated",
					spMetadata: {},
				},
			},
			headers, // Main session headers (owner)
		});

		try {
			await auth.api.getSSOProvider({
				query: {
					providerId: "provider-b-isolated",
				},
				headers: ssoHeaders, // SSO-scoped headers for Org A
			});
			throw new Error("Should have thrown 403");
		} catch (e: any) {
			expect(e.status).toBe("FORBIDDEN");
			console.log(
				"✓ Step 3: SSO Provider access blocked for different org (403)",
			);
		}

		/**
		 * STEP 4: Domain Verification Isolation
		 */
		/**
		 * STEP 4: Domain Verification Isolation
		 */
		try {
			await auth.api.verifyDomain({
				body: {
					providerId: "provider-b-isolated",
				},
				headers: ssoHeaders,
			});
			throw new Error("Should have thrown 403");
		} catch (e: any) {
			expect(e.status).toBe("FORBIDDEN");
			console.log(
				"✓ Step 4: Domain verification blocked for different org (403)",
			);
		}
	});
});
