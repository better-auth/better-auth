import { sso } from "@better-auth/sso";
import { APIError, betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import type { OrganizationOptions } from "better-auth/plugins";
import { bearer, organization } from "better-auth/plugins";
import { describe, expect, it, vi } from "vitest";
import { scim } from ".";
import { scimClient } from "./client";
import type { SCIMOptions } from "./types";

const createTestInstance = (
	scimOptions?: SCIMOptions,
	organizationOptions?: OrganizationOptions,
) => {
	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};

	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		ssoProvider: [],
		scimProvider: [],
		scimGroup: [],
		scimGroupMember: [],
		scimGroupRole: [],
		scimGroupRoleGrant: [],
		organization: [],
		member: [],
	};
	const memory = memoryAdapter(data);

	const auth = betterAuth({
		database: memory,
		baseURL: "http://localhost:3000",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [sso(), scim(scimOptions), organization(organizationOptions)],
	});

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [bearer(), scimClient()],
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	async function getAuthCookieHeaders(
		user: { email: string; password: string; name: string } = testUser,
	) {
		const headers = new Headers();

		await authClient.signUp.email({
			email: user.email,
			password: user.password,
			name: user.name,
		});

		await authClient.signIn.email(user, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});

		return headers;
	}

	let defaultOrgPromise: Promise<string | undefined> | undefined;
	function ensureDefaultOrg(headers: Headers) {
		if (!defaultOrgPromise) {
			defaultOrgPromise = auth.api
				.createOrganization({
					body: { slug: "default-org", name: "Default Org" },
					headers,
				})
				.then((org) => org!.id);
		}
		return defaultOrgPromise;
	}

	async function getSCIMToken(
		providerId: string = "the-saml-provider-1",
		organizationId?: string,
		userHeaders?: Headers,
	) {
		const headers = userHeaders ?? (await getAuthCookieHeaders());
		const orgId = organizationId ?? (await ensureDefaultOrg(headers));
		if (!orgId) throw new Error("Default organization not found");
		const { scimToken } = await auth.api.generateSCIMToken({
			body: {
				providerId,
				organizationId: orgId,
			},
			headers,
		});

		return scimToken;
	}

	async function registerOrganization(org: string, userHeaders?: Headers) {
		const headers = userHeaders ?? (await getAuthCookieHeaders());
		return await auth.api.createOrganization({
			body: {
				slug: `the-${org}`,
				name: `the organization ${org}`,
			},
			headers,
		});
	}

	return {
		auth,
		authClient,
		registerOrganization,
		getSCIMToken,
		getAuthCookieHeaders,
		ensureDefaultOrg,
	};
};

const policyUserA = {
	email: "user1@policy.test",
	password: "password",
	name: "User One",
};

const policyUserB = {
	email: "user2@policy.test",
	password: "password",
	name: "User Two",
};

describe("SCIM provider management", () => {
	describe("POST /scim/generate-token", () => {
		it("should require user session", async () => {
			const { auth } = createTestInstance();
			const generateSCIMToken = () =>
				auth.api.generateSCIMToken({
					body: { providerId: "the id", organizationId: "the-org" },
				});

			await expect(generateSCIMToken()).rejects.toThrowError(
				expect.objectContaining({
					status: "UNAUTHORIZED",
				}),
			);
		});

		it("should reject a token mint without an organization", async () => {
			const { auth, getAuthCookieHeaders } = createTestInstance();
			const headers = await getAuthCookieHeaders();

			await expect(
				auth.api.generateSCIMToken({
					// @ts-expect-error Testing request validation for a missing required field.
					body: { providerId: "no-org-provider" },
					headers,
				}),
			).rejects.toThrowError(
				expect.objectContaining({
					message: expect.stringContaining("[body.organizationId]"),
				}),
			);
		});

		it("should fail if the authenticated user does not belong to the given org", async () => {
			const { auth, getAuthCookieHeaders } = createTestInstance();
			const headers = await getAuthCookieHeaders();
			const generateSCIMToken = () =>
				auth.api.generateSCIMToken({
					body: { providerId: "the id", organizationId: "the-org" },
					headers,
				});

			await expect(generateSCIMToken()).rejects.toThrowError(
				expect.objectContaining({
					message: "You are not a member of the organization",
				}),
			);
		});

		it("should fail to generate a SCIM token on invalid provider", async () => {
			const { auth, getAuthCookieHeaders } = createTestInstance({
				storeSCIMToken: "plain",
			});
			const headers = await getAuthCookieHeaders();
			const org = await auth.api.createOrganization({
				body: { slug: "provider-validation", name: "Provider Validation" },
				headers,
			});

			const generateSCIMToken = (providerId: string) =>
				auth.api.generateSCIMToken({
					body: { providerId, organizationId: org!.id },
					headers,
				});

			await expect(generateSCIMToken("the:provider")).rejects.toThrowError(
				expect.objectContaining({
					message: "Provider id contains forbidden characters",
				}),
			);
		});

		it("should generate a new scim token (client)", async () => {
			const { auth, authClient, getAuthCookieHeaders, ensureDefaultOrg } =
				createTestInstance();

			const headers = await getAuthCookieHeaders();
			const response = await authClient.scim.generateToken(
				{
					providerId: "the id",
					organizationId: (await ensureDefaultOrg(headers))!,
				},
				{ headers },
			);

			expect(response.data).toMatchObject({
				scimToken: expect.any(String),
			});

			const createUser = () =>
				auth.api.createSCIMUser({
					body: {
						userName: "the-username",
					},
					headers: {
						authorization: `Bearer ${response.data?.scimToken}`,
					},
				});

			await expect(createUser()).resolves.toBeTruthy();
		});

		it("should generate a new scim token (plain)", async () => {
			const { auth, getAuthCookieHeaders } = createTestInstance({
				storeSCIMToken: "plain",
			});
			const headers = await getAuthCookieHeaders();

			const org = await auth.api.createOrganization({
				body: { slug: "gen-org", name: "Gen Org" },
				headers,
			});
			const response = await auth.api.generateSCIMToken({
				body: { providerId: "the id", organizationId: org!.id },
				headers,
			});

			expect(response).toMatchObject({
				scimToken: expect.any(String),
			});

			const createUser = () =>
				auth.api.createSCIMUser({
					body: {
						userName: "the-username",
					},
					headers: {
						authorization: `Bearer ${response.scimToken}`,
					},
				});

			await expect(createUser()).resolves.toBeTruthy();
		});

		it("should generate a new scim token (hashed)", async () => {
			const { auth, getAuthCookieHeaders } = createTestInstance({
				storeSCIMToken: "hashed",
			});
			const headers = await getAuthCookieHeaders();

			const org = await auth.api.createOrganization({
				body: { slug: "gen-org", name: "Gen Org" },
				headers,
			});
			const response = await auth.api.generateSCIMToken({
				body: { providerId: "the id", organizationId: org!.id },
				headers,
			});

			expect(response).toMatchObject({
				scimToken: expect.any(String),
			});

			const createUser = () =>
				auth.api.createSCIMUser({
					body: {
						userName: "the-username",
					},
					headers: {
						authorization: `Bearer ${response.scimToken}`,
					},
				});

			await expect(createUser()).resolves.toBeTruthy();
		});

		it("should generate a new scim token (custom hash)", async () => {
			const { auth, getAuthCookieHeaders } = createTestInstance({
				storeSCIMToken: { hash: async (value) => value + "hello" },
			});

			const headers = await getAuthCookieHeaders();
			const org = await auth.api.createOrganization({
				body: { slug: "gen-org", name: "Gen Org" },
				headers,
			});
			const response = await auth.api.generateSCIMToken({
				body: { providerId: "the id", organizationId: org!.id },
				headers,
			});

			const createUser = () =>
				auth.api.createSCIMUser({
					body: {
						userName: "the-username",
					},
					headers: {
						authorization: `Bearer ${response.scimToken}`,
					},
				});

			await expect(createUser()).resolves.toBeTruthy();
		});

		it("should generate a new scim token (encrypted)", async () => {
			const { auth, getAuthCookieHeaders } = createTestInstance({
				storeSCIMToken: "encrypted",
			});

			const headers = await getAuthCookieHeaders();
			const org = await auth.api.createOrganization({
				body: { slug: "gen-org", name: "Gen Org" },
				headers,
			});
			const response = await auth.api.generateSCIMToken({
				body: { providerId: "the id", organizationId: org!.id },
				headers,
			});

			const createUser = () =>
				auth.api.createSCIMUser({
					body: {
						userName: "the-username",
					},
					headers: {
						authorization: `Bearer ${response.scimToken}`,
					},
				});

			await expect(createUser()).resolves.toBeTruthy();
		});

		it("should generate a new scim token (custom encryption)", async () => {
			const { auth, getAuthCookieHeaders } = createTestInstance({
				storeSCIMToken: {
					encrypt: async (value) => value,
					decrypt: async (value) => value,
				},
			});

			const headers = await getAuthCookieHeaders();
			const org = await auth.api.createOrganization({
				body: { slug: "gen-org", name: "Gen Org" },
				headers,
			});
			const response = await auth.api.generateSCIMToken({
				body: { providerId: "the id", organizationId: org!.id },
				headers,
			});

			const createUser = () =>
				auth.api.createSCIMUser({
					body: {
						userName: "the-username",
					},
					headers: {
						authorization: `Bearer ${response.scimToken}`,
					},
				});

			await expect(createUser()).resolves.toBeTruthy();
		});

		it("rejects a SCIM token whose secret does not match the stored value", async () => {
			const { auth, getAuthCookieHeaders } = createTestInstance({
				storeSCIMToken: "hashed",
			});
			const headers = await getAuthCookieHeaders();

			const org = await auth.api.createOrganization({
				body: { slug: "gen-org", name: "Gen Org" },
				headers,
			});
			const response = await auth.api.generateSCIMToken({
				body: { providerId: "the id", organizationId: org!.id },
				headers,
			});

			const [secret, ...rest] = Buffer.from(response.scimToken, "base64url")
				.toString()
				.split(":");
			if (!secret) {
				throw new Error("Expected generated SCIM token to include a secret");
			}
			// Tamper the secret while preserving its length, so verification cannot
			// short-circuit on a length mismatch and must reject the value itself
			// through the constant-time comparison.
			const forgedSecret = `${secret.slice(0, -1)}${
				secret.endsWith("x") ? "y" : "x"
			}`;
			const forgedToken = Buffer.from(
				[forgedSecret, ...rest].join(":"),
			).toString("base64url");

			await expect(
				auth.api.createSCIMUser({
					body: { userName: "the-username" },
					headers: { authorization: `Bearer ${forgedToken}` },
				}),
			).rejects.toThrowError(
				expect.objectContaining({ status: "UNAUTHORIZED" }),
			);
		});

		it("should generate a new scim token associated to an org", async () => {
			const { auth, registerOrganization, getAuthCookieHeaders } =
				createTestInstance();
			const orgA = await registerOrganization("org-a");
			const headers = await getAuthCookieHeaders();

			const response = await auth.api.generateSCIMToken({
				body: { providerId: "the id", organizationId: orgA!.id },
				headers,
			});

			expect(response).toMatchObject({
				scimToken: expect.any(String),
			});
		});

		it("should execute hooks before SCIM token generation", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance({
					beforeSCIMTokenGenerated: async ({ user, member, scimToken }) => {
						if (member?.role === "owner") {
							throw new APIError("FORBIDDEN", {
								message:
									"You do not have enough privileges to generate a SCIM token",
							});
						}
					},
				});
			const headers = await getAuthCookieHeaders();
			const orgA = await registerOrganization("the org");

			const generateSCIMToken = () =>
				auth.api.generateSCIMToken({
					body: { providerId: "the id", organizationId: orgA!.id },
					headers,
				});

			await expect(generateSCIMToken()).rejects.toThrowError(
				expect.objectContaining({
					message: "You do not have enough privileges to generate a SCIM token",
				}),
			);
		});

		it("should execute hooks after SCIM token generation", async () => {
			const { auth, getAuthCookieHeaders } = createTestInstance({
				storeSCIMToken: "plain",
				afterSCIMTokenGenerated: async ({
					user,
					member,
					scimProvider,
					scimToken,
				}) => {
					expect(scimProvider.scimToken).toBeTypeOf("string");
				},
			});
			const headers = await getAuthCookieHeaders();

			const org = await auth.api.createOrganization({
				body: { slug: "gen-org", name: "Gen Org" },
				headers,
			});
			const response = await auth.api.generateSCIMToken({
				body: { providerId: "the id", organizationId: org!.id },
				headers,
			});

			expect(response).toMatchObject({
				scimToken: expect.any(String),
			});
		});

		it("should deny regenerate when provider belongs to another org", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance();

			const [headers1, headers2] = await Promise.all([
				getAuthCookieHeaders(policyUserA),
				getAuthCookieHeaders(policyUserB),
			]);

			const [org1, _org2] = await Promise.all([
				registerOrganization("policy-org-1", headers1),
				registerOrganization("policy-org-2", headers2),
			]);

			await auth.api.generateSCIMToken({
				body: { providerId: "other-org", organizationId: org1!.id },
				headers: headers1,
			});

			// User B targets org1's provider but is not a member of org1.
			await expect(
				auth.api.generateSCIMToken({
					body: { providerId: "other-org", organizationId: org1!.id },
					headers: headers2,
				}),
			).rejects.toMatchObject({
				status: "FORBIDDEN",
				message: "You are not a member of the organization",
			});
		});
	});

	describe("GET /scim/list-provider-connections", () => {
		it("should return empty list when user is not in any org", async () => {
			const { auth, getAuthCookieHeaders } = createTestInstance();
			const headers = await getAuthCookieHeaders();

			const res = await auth.api.listSCIMProviderConnections({ headers });

			expect(res).toMatchObject({ providers: [] });
		});

		it("should return org-scoped providers for orgs the user is a member of", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization, getSCIMToken } =
				createTestInstance();

			const [headersUserA, headersUserB] = await Promise.all([
				getAuthCookieHeaders(policyUserA),
				getAuthCookieHeaders(policyUserB),
			]);
			const [orgA, orgB] = await Promise.all([
				registerOrganization("org-a", headersUserA),
				registerOrganization("org-b", headersUserB),
			]);

			await Promise.all([
				getSCIMToken("provider-1", orgA!.id, headersUserA),
				getSCIMToken("provider-2", orgA!.id, headersUserA),
				getSCIMToken("provider-3", orgB!.id, headersUserB),
			]);

			const res = await auth.api.listSCIMProviderConnections({
				headers: headersUserA,
			});

			expect(res.providers).toHaveLength(2);
			expect(res.providers?.map((p) => p.providerId).sort()).toEqual([
				"provider-1",
				"provider-2",
			]);
			const byProviderId = Object.fromEntries(
				(res.providers ?? []).map((p) => [p.providerId, p]),
			);
			expect(byProviderId["provider-1"]).toMatchObject({
				id: expect.any(String),
				providerId: "provider-1",
				organizationId: orgA!.id,
			});
			expect(byProviderId["provider-2"]).toMatchObject({
				id: expect.any(String),
				providerId: "provider-2",
				organizationId: orgA!.id,
			});
		});

		it("should query providers only from the user's organizations", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization, getSCIMToken } =
				createTestInstance();

			const [headersUserA, headersUserB] = await Promise.all([
				getAuthCookieHeaders(policyUserA),
				getAuthCookieHeaders(policyUserB),
			]);
			const [orgA, orgB] = await Promise.all([
				registerOrganization("filtered-org-a", headersUserA),
				registerOrganization("filtered-org-b", headersUserB),
			]);

			await Promise.all([
				getSCIMToken("filtered-provider-a", orgA!.id, headersUserA),
				getSCIMToken("filtered-provider-b", orgB!.id, headersUserB),
			]);

			const ctx = await auth.$context;
			const findManySpy = vi.spyOn(ctx.adapter, "findMany");

			try {
				const res = await auth.api.listSCIMProviderConnections({
					headers: headersUserA,
				});

				expect(res.providers?.map((p) => p.providerId)).toEqual([
					"filtered-provider-a",
				]);

				const scimProviderCall = findManySpy.mock.calls.find(
					([query]) => query.model === "scimProvider",
				)?.[0];
				expect(scimProviderCall).toEqual(
					expect.objectContaining({
						model: "scimProvider",
						where: [
							{
								field: "organizationId",
								value: [orgA!.id],
								operator: "in",
							},
						],
					}),
				);
			} finally {
				findManySpy.mockRestore();
			}
		});
	});

	describe("GET /scim/get-provider-connection", () => {
		it("should return provider details when user is org member", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization, getSCIMToken } =
				createTestInstance();
			const headers = await getAuthCookieHeaders();

			const org = await registerOrganization("scim-get-org");
			await getSCIMToken("my-provider", org!.id);

			const res = await auth.api.getSCIMProviderConnection({
				query: { providerId: "my-provider", organizationId: org!.id },
				headers,
			});

			expect(res).toMatchObject({
				id: expect.any(String),
				providerId: "my-provider",
				organizationId: org!.id,
			});
		});

		it("should return 403 when provider belongs to another org", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance();

			const [headers1, headers2] = await Promise.all([
				getAuthCookieHeaders(policyUserA),
				getAuthCookieHeaders(policyUserB),
			]);

			const [org1, _org2] = await Promise.all([
				registerOrganization("get-policy-org-1", headers1),
				registerOrganization("get-policy-org-2", headers2),
			]);

			await auth.api.generateSCIMToken({
				body: { providerId: "other-org-provider", organizationId: org1!.id },
				headers: headers1,
			});

			await expect(
				auth.api.getSCIMProviderConnection({
					query: {
						providerId: "other-org-provider",
						organizationId: org1!.id,
					},
					headers: headers2,
				}),
			).rejects.toMatchObject({
				status: "FORBIDDEN",
				message: "You are not a member of the organization",
			});
		});

		it("should return 403 when token creator was removed from org (org membership required)", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance();

			const [headersUserA, headersUserB] = await Promise.all([
				getAuthCookieHeaders(policyUserA),
				getAuthCookieHeaders(policyUserB),
			]);

			const org = await registerOrganization("owner-removed-org", headersUserA);
			await auth.api.generateSCIMToken({
				body: { providerId: "owner-removed-provider", organizationId: org!.id },
				headers: headersUserA,
			});

			const sessionB = await auth.api.getSession({ headers: headersUserB });
			if (!sessionB?.user?.id) throw new Error("User B session not found");
			await auth.api.addMember({
				body: {
					organizationId: org!.id,
					userId: sessionB.user.id,
					role: "owner",
				},
				headers: headersUserA,
			});

			await auth.api.removeMember({
				body: {
					organizationId: org!.id,
					memberIdOrEmail: policyUserA.email,
				},
				headers: headersUserB,
			});

			await expect(
				auth.api.getSCIMProviderConnection({
					query: {
						providerId: "owner-removed-provider",
						organizationId: org!.id,
					},
					headers: headersUserA,
				}),
			).rejects.toMatchObject({
				status: "FORBIDDEN",
				message: "You are not a member of the organization",
			});

			const listRes = await auth.api.listSCIMProviderConnections({
				headers: headersUserA,
			});
			expect(
				listRes.providers?.some(
					(p) => p.providerId === "owner-removed-provider",
				),
			).toBe(false);
		});

		it("should return 404 for unknown providerId", async () => {
			const { auth, getAuthCookieHeaders, ensureDefaultOrg } =
				createTestInstance();
			const headers = await getAuthCookieHeaders();
			const organizationId = (await ensureDefaultOrg(headers))!;

			await expect(
				auth.api.getSCIMProviderConnection({
					query: { providerId: "unknown", organizationId },
					headers,
				}),
			).rejects.toMatchObject({
				message: "SCIM provider not found",
			});
		});
	});

	describe("POST /scim/delete-provider-connection", () => {
		it("should delete org-scoped provider and invalidate token when user is org member", async () => {
			const { auth, getAuthCookieHeaders, getSCIMToken, registerOrganization } =
				createTestInstance();
			const headers = await getAuthCookieHeaders();

			const org = await registerOrganization("org-a");
			const scimToken = await getSCIMToken("my-provider", org!.id);

			const listBefore = await auth.api.listSCIMProviderConnections({
				headers,
			});
			expect(
				listBefore.providers?.some((p) => p.providerId === "my-provider"),
			).toBe(true);

			const deleteRes = await auth.api.deleteSCIMProviderConnection({
				body: { providerId: "my-provider", organizationId: org!.id },
				headers,
			});
			expect(deleteRes).toMatchObject({ success: true });

			const listAfter = await auth.api.listSCIMProviderConnections({ headers });
			expect(
				listAfter.providers?.some((p) => p.providerId === "my-provider"),
			).toBe(false);

			await expect(
				auth.api.getSCIMUser({
					params: { userId: "any" },
					headers: {
						Authorization: `Bearer ${scimToken}`,
					},
				}),
			).rejects.toThrow();
		});

		it("should return 403 when provider belongs to another org", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance();

			const [headers1, headers2] = await Promise.all([
				getAuthCookieHeaders(policyUserA),
				getAuthCookieHeaders(policyUserB),
			]);

			const [org1, _org2] = await Promise.all([
				registerOrganization("del-policy-org-1", headers1),
				registerOrganization("del-policy-org-2", headers2),
			]);

			await auth.api.generateSCIMToken({
				body: { providerId: "other-org-del", organizationId: org1!.id },
				headers: headers1,
			});

			await expect(
				auth.api.deleteSCIMProviderConnection({
					body: { providerId: "other-org-del", organizationId: org1!.id },
					headers: headers2,
				}),
			).rejects.toMatchObject({
				status: "FORBIDDEN",
				message: "You are not a member of the organization",
			});
		});

		it("should return 404 for unknown providerId", async () => {
			const { auth, getAuthCookieHeaders, ensureDefaultOrg } =
				createTestInstance();
			const headers = await getAuthCookieHeaders();
			const organizationId = (await ensureDefaultOrg(headers))!;

			await expect(
				auth.api.deleteSCIMProviderConnection({
					body: { providerId: "unknown", organizationId },
					headers,
				}),
			).rejects.toMatchObject({
				message: "SCIM provider not found",
			});
		});
	});

	describe("role-based authorization", () => {
		/**
		 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-2g28-66mv-wghh
		 */
		it("should deny org-scoped token generation for a regular member", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance();

			const headersOwner = await getAuthCookieHeaders(policyUserA);
			const headersMember = await getAuthCookieHeaders(policyUserB);

			const org = await registerOrganization("role-test-org", headersOwner);

			const sessionB = await auth.api.getSession({
				headers: headersMember,
			});
			await auth.api.addMember({
				body: {
					organizationId: org!.id,
					userId: sessionB!.user.id,
					role: "member",
				},
				headers: headersOwner,
			});

			await expect(
				auth.api.generateSCIMToken({
					body: {
						providerId: "member-attempt",
						organizationId: org!.id,
					},
					headers: headersMember,
				}),
			).rejects.toMatchObject({
				status: "FORBIDDEN",
				message: "Insufficient role for this operation",
			});
		});

		/**
		 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-2g28-66mv-wghh
		 */
		it("should allow org-scoped token generation for an admin", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance();

			const headersOwner = await getAuthCookieHeaders(policyUserA);
			const headersAdmin = await getAuthCookieHeaders(policyUserB);

			const org = await registerOrganization("admin-test-org", headersOwner);

			const sessionB = await auth.api.getSession({
				headers: headersAdmin,
			});
			await auth.api.addMember({
				body: {
					organizationId: org!.id,
					userId: sessionB!.user.id,
					role: "admin",
				},
				headers: headersOwner,
			});

			const result = await auth.api.generateSCIMToken({
				body: {
					providerId: "admin-attempt",
					organizationId: org!.id,
				},
				headers: headersAdmin,
			});

			expect(result).toMatchObject({
				scimToken: expect.any(String),
			});
		});

		it("should allow org provider access for members with multiple roles", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance();

			const headersOwner = await getAuthCookieHeaders(policyUserA);
			const headersPrivilegedMember = await getAuthCookieHeaders(policyUserB);

			const org = await registerOrganization("multi-role-org", headersOwner);

			const sessionB = await auth.api.getSession({
				headers: headersPrivilegedMember,
			});
			await auth.api.addMember({
				body: {
					organizationId: org!.id,
					userId: sessionB!.user.id,
					role: ["member", "admin"],
				},
				headers: headersOwner,
			});

			const result = await auth.api.generateSCIMToken({
				body: {
					providerId: "multi-role-provider",
					organizationId: org!.id,
				},
				headers: headersPrivilegedMember,
			});
			expect(result).toMatchObject({
				scimToken: expect.any(String),
			});

			const memberList = await auth.api.listSCIMProviderConnections({
				headers: headersPrivilegedMember,
			});
			expect(
				memberList.providers?.some(
					(p) => p.providerId === "multi-role-provider",
				),
			).toBe(true);

			const provider = await auth.api.getSCIMProviderConnection({
				query: { providerId: "multi-role-provider", organizationId: org!.id },
				headers: headersPrivilegedMember,
			});
			expect(provider).toMatchObject({
				providerId: "multi-role-provider",
				organizationId: org!.id,
			});
		});

		it("should respect custom requiredRole configuration", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance({ requiredRole: ["owner"] });

			const headersOwner = await getAuthCookieHeaders(policyUserA);
			const headersAdmin = await getAuthCookieHeaders(policyUserB);

			const org = await registerOrganization("custom-role-org", headersOwner);

			const sessionB = await auth.api.getSession({
				headers: headersAdmin,
			});
			await auth.api.addMember({
				body: {
					organizationId: org!.id,
					userId: sessionB!.user.id,
					role: "admin",
				},
				headers: headersOwner,
			});

			// Admin should be rejected when requiredRole is ["owner"]
			await expect(
				auth.api.generateSCIMToken({
					body: {
						providerId: "custom-role-attempt",
						organizationId: org!.id,
					},
					headers: headersAdmin,
				}),
			).rejects.toMatchObject({
				status: "FORBIDDEN",
				message: "Insufficient role for this operation",
			});

			// Owner should succeed
			const result = await auth.api.generateSCIMToken({
				body: {
					providerId: "custom-role-attempt",
					organizationId: org!.id,
				},
				headers: headersOwner,
			});
			expect(result).toMatchObject({
				scimToken: expect.any(String),
			});
		});

		it("should not let a custom requiredRole resolver bypass organization membership", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance({ requiredRole: () => true });

			const headersOwner = await getAuthCookieHeaders(policyUserA);
			const headersOutsider = await getAuthCookieHeaders(policyUserB);

			const org = await registerOrganization(
				"resolver-membership-org",
				headersOwner,
			);

			await expect(
				auth.api.generateSCIMToken({
					body: {
						providerId: "resolver-membership-provider",
						organizationId: org!.id,
					},
					headers: headersOutsider,
				}),
			).rejects.toMatchObject({
				status: "FORBIDDEN",
				message: "You are not a member of the organization",
			});
		});

		it("should default to the organization creator role when it is customized", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance(undefined, {
					creatorRole: "super-admin",
				});

			const headersCreator = await getAuthCookieHeaders(policyUserA);
			const org = await registerOrganization(
				"custom-creator-role",
				headersCreator,
			);

			const result = await auth.api.generateSCIMToken({
				body: {
					providerId: "custom-creator-role-provider",
					organizationId: org!.id,
				},
				headers: headersCreator,
			});
			expect(result).toMatchObject({
				scimToken: expect.any(String),
			});

			const creatorList = await auth.api.listSCIMProviderConnections({
				headers: headersCreator,
			});
			expect(
				creatorList.providers?.some(
					(p) => p.providerId === "custom-creator-role-provider",
				),
			).toBe(true);
		});

		it("should filter org providers by role in list endpoint", async () => {
			const { auth, getAuthCookieHeaders, registerOrganization } =
				createTestInstance();

			const headersOwner = await getAuthCookieHeaders(policyUserA);
			const headersMember = await getAuthCookieHeaders(policyUserB);

			const org = await registerOrganization("list-role-org", headersOwner);

			const sessionB = await auth.api.getSession({
				headers: headersMember,
			});
			await auth.api.addMember({
				body: {
					organizationId: org!.id,
					userId: sessionB!.user.id,
					role: "member",
				},
				headers: headersOwner,
			});

			await auth.api.generateSCIMToken({
				body: {
					providerId: "list-role-provider",
					organizationId: org!.id,
				},
				headers: headersOwner,
			});

			// Owner sees the provider
			const ownerList = await auth.api.listSCIMProviderConnections({
				headers: headersOwner,
			});
			expect(
				ownerList.providers?.some((p) => p.providerId === "list-role-provider"),
			).toBe(true);

			// Regular member does NOT see the provider
			const memberList = await auth.api.listSCIMProviderConnections({
				headers: headersMember,
			});
			expect(
				memberList.providers?.some(
					(p) => p.providerId === "list-role-provider",
				),
			).toBe(false);
		});
	});
});
