import { sso } from "@better-auth/sso";
import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { bearer, organization } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import { scimClient } from "./client";
import type { SCIMOptions } from "./types";

const createTestInstance = (
	scimOptions?: SCIMOptions,
	extraPlugins: BetterAuthPlugin[] = [],
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
		plugins: [sso(), scim(scimOptions), organization(), ...extraPlugins],
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
	) {
		const headers = await getAuthCookieHeaders();
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

	async function registerOrganization(org: string) {
		const headers = await getAuthCookieHeaders();

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
	};
};

describe("SCIM", () => {
	describe("GET /scim/v2/Users", () => {
		it("should return the list of users", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const createUser = (userName: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA, userB] = await Promise.all([
				createUser("user-a"),
				createUser("user-b"),
			]);

			const users = await auth.api.listSCIMUsers({
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(users).toMatchObject({
				itemsPerPage: 2,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 2,
				Resources: [userA, userB],
			});
		});

		it("should return an empty list when no users have been provisioned or belong to the organization", async () => {
			const { auth, getSCIMToken, registerOrganization } = createTestInstance();
			const scimToken = await getSCIMToken();

			const createUser = (userName: string, scimToken: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const listUsers = (scimToken: string) => {
				return auth.api.listSCIMUsers({
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const users = await listUsers(scimToken);

			expect(users).toMatchObject({
				itemsPerPage: 0,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 0,
				Resources: [],
			});

			const [organizationA, organizationB] = await Promise.all([
				registerOrganization("org-a"),
				registerOrganization("org-b"),
			]);

			const [scimTokenOrgA, scimTokenOrgB] = await Promise.all([
				getSCIMToken("provider-org-a", organizationA!.id),
				getSCIMToken("provider-org-b", organizationB!.id),
			]);

			await createUser("user-a", scimTokenOrgA);
			const orgBUsers = await listUsers(scimTokenOrgB);

			expect(orgBUsers).toMatchObject({
				itemsPerPage: 0,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 0,
				Resources: [],
			});
		});

		it("should only allow access to users that belong to the same provider", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const [scimTokenProviderA, scimTokenProviderB] = await Promise.all([
				getSCIMToken("provider-a"),
				getSCIMToken("provider-b"),
			]);

			const createUser = (userName: string, scimToken: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const listUsers = (scimToken: string) => {
				return auth.api.listSCIMUsers({
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA, userB, userC] = await Promise.all([
				createUser("user-a", scimTokenProviderB),
				createUser("user-b", scimTokenProviderA),
				createUser("user-c", scimTokenProviderB),
			]);

			const [usersProviderA, usersProviderB] = await Promise.all([
				listUsers(scimTokenProviderA),
				listUsers(scimTokenProviderB),
			]);

			expect(usersProviderA).toMatchObject({
				itemsPerPage: 1,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 1,
				Resources: [userB],
			});

			expect(usersProviderB).toMatchObject({
				itemsPerPage: 2,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 2,
				Resources: [userA, userC],
			});
		});

		it("should only allow access to users that belong to the same provider and organization", async () => {
			const { auth, getSCIMToken, registerOrganization } = createTestInstance();
			const [organizationA, organizationB] = await Promise.all([
				registerOrganization("org:a"),
				registerOrganization("org:b"),
			]);

			const [scimTokenProviderA, scimTokenProviderB] = await Promise.all([
				getSCIMToken("provider-a", organizationA!.id),
				getSCIMToken("provider-b", organizationB!.id),
			]);

			const createUser = (userName: string, scimToken: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const listUsers = (scimToken: string) => {
				return auth.api.listSCIMUsers({
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA, userB, userC] = await Promise.all([
				createUser("user-a", scimTokenProviderB),
				createUser("user-b", scimTokenProviderA),
				createUser("user-c", scimTokenProviderB),
			]);

			const [usersProviderA, usersProviderB] = await Promise.all([
				listUsers(scimTokenProviderA),
				listUsers(scimTokenProviderB),
			]);

			expect(usersProviderA).toMatchObject({
				itemsPerPage: 1,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 1,
				Resources: [userB],
			});

			expect(usersProviderB).toMatchObject({
				itemsPerPage: 2,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 2,
				Resources: [userA, userC],
			});
		});

		it("should filter the list of users", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const createUser = (userName: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA] = await Promise.all([
				createUser("user-a"),
				createUser("user-b"),
				createUser("user-c"),
			]);

			const users = await auth.api.listSCIMUsers({
				query: {
					filter: 'UserName Eq "USER-A"',
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(users).toMatchObject({
				itemsPerPage: 1,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 1,
				Resources: [userA],
			});
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const getUsers = async () => {
				await auth.api.listSCIMUsers();
			};

			await expect(getUsers()).rejects.toThrowError(
				expect.objectContaining({
					message: "SCIM token is required",
					body: {
						detail: "SCIM token is required",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "401",
					},
				}),
			);
		});
	});

	describe("GET /scim/v2/Users/:userId", () => {
		it("should return a single user resource", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const newUser = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const retrievedUser = await auth.api.getSCIMUser({
				params: {
					userId: newUser.id,
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(newUser).toEqual(retrievedUser);
		});

		it("should only allow access to users that belong to the same provider", async () => {
			const { auth, getSCIMToken } = createTestInstance();

			const [scimTokenProviderA, scimTokenProviderB] = await Promise.all([
				getSCIMToken("provider-a"),
				getSCIMToken("provider-b"),
			]);

			const createUser = (userName: string, scimToken: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const getUser = (userId: string, scimToken: string) => {
				return auth.api.getSCIMUser({
					params: {
						userId,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA, userB] = await Promise.all([
				createUser("user-a", scimTokenProviderB),
				createUser("user-b", scimTokenProviderA),
			]);

			const retrievedUserB = await getUser(userB.id, scimTokenProviderA);
			expect(retrievedUserB).toEqual(userB);

			await expect(getUser(userB.id, scimTokenProviderB)).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "404",
					},
				}),
			);

			const retrievedUserA = await getUser(userA.id, scimTokenProviderB);
			expect(retrievedUserA).toEqual(userA);

			await expect(getUser(userA.id, scimTokenProviderA)).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "404",
					},
				}),
			);
		});

		it("should only allow access to users that belong to the same provider and organization", async () => {
			const { auth, registerOrganization, getSCIMToken } = createTestInstance();
			const [organizationA, organizationB] = await Promise.all([
				registerOrganization("org-a"),
				registerOrganization("org-b"),
			]);

			const [scimTokenProviderA, scimTokenProviderB] = await Promise.all([
				getSCIMToken("provider-a", organizationA!.id),
				getSCIMToken("provider-b", organizationB!.id),
			]);

			const createUser = (userName: string, scimToken: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const getUser = (userId: string, scimToken: string) => {
				return auth.api.getSCIMUser({
					params: {
						userId,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA, userB] = await Promise.all([
				createUser("user-a", scimTokenProviderB),
				createUser("user-b", scimTokenProviderA),
			]);

			const retrievedUserB = await getUser(userB.id, scimTokenProviderA);
			expect(retrievedUserB).toEqual(userB);

			await expect(getUser(userB.id, scimTokenProviderB)).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "404",
					},
				}),
			);

			const retrievedUserA = await getUser(userA.id, scimTokenProviderB);
			expect(retrievedUserA).toEqual(userA);

			await expect(getUser(userA.id, scimTokenProviderA)).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "404",
					},
				}),
			);
		});

		it("should return not found for missing users", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const getUser = () =>
				auth.api.getSCIMUser({
					params: {
						userId: "missing",
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(getUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "404",
					},
				}),
			);
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const getUser = async () => {
				await auth.api.getSCIMUser();
			};

			await expect(getUser()).rejects.toThrow(/SCIM token is required/);
		});
	});

	describe("DELETE /scim/v2/Users/:userId", () => {
		it("should delete an existing user", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const newUser = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			await auth.api.deleteSCIMUser({
				params: {
					userId: newUser.id,
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const getUser = () =>
				auth.api.getSCIMUser({
					params: {
						userId: newUser.id,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(getUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "404",
					},
				}),
			);
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const deleteUser = async () => {
				await auth.api.deleteSCIMUser({
					params: {
						userId: "whatever",
					},
				});
			};

			await expect(deleteUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "SCIM token is required",
					body: {
						detail: "SCIM token is required",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "401",
					},
				}),
			);
		});

		it("should not delete a missing user", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const deleteUser = () =>
				auth.api.deleteSCIMUser({
					params: {
						userId: "missing",
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(deleteUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "404",
					},
				}),
			);
		});

		/**
		 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-2vg6-77g8-24mp
		 */
		it("should clear secondary storage sessions when deleting a user via SCIM", async () => {
			const store = new Map<string, string>();
			const adminUser = {
				email: "scim-admin@test.com",
				password: "password",
				name: "SCIM Admin",
			};
			const victimUser = {
				email: "scim-victim@test.com",
				password: "password",
				name: "SCIM Victim",
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
				emailAndPassword: { enabled: true },
				plugins: [scim(), organization()],
				secondaryStorage: {
					set(key, value) {
						store.set(key, value);
					},
					get(key) {
						return store.get(key) || null;
					},
					getAndDelete(key) {
						const value = store.get(key) || null;
						store.delete(key);
						return value;
					},
					increment(key) {
						const count = Number(store.get(key) ?? 0) + 1;
						store.set(key, String(count));
						return count;
					},
					delete(key) {
						store.delete(key);
					},
				},
			});

			const authClient = createAuthClient({
				baseURL: "http://localhost:3000",
				plugins: [bearer(), scimClient()],
				fetchOptions: {
					customFetchImpl: async (url, init) =>
						auth.handler(new Request(url, init)),
				},
			});

			await authClient.signUp.email(adminUser);
			const adminHeaders = new Headers();
			await authClient.signIn.email(adminUser, {
				throw: true,
				onSuccess: setCookieToHeader(adminHeaders),
			});

			const org = await auth.api.createOrganization({
				body: { slug: "scim-storage-org", name: "SCIM Storage Org" },
				headers: adminHeaders,
			});
			const { scimToken } = await auth.api.generateSCIMToken({
				body: { providerId: "the-saml-provider-1", organizationId: org!.id },
				headers: adminHeaders,
			});

			const provisioned = await auth.api.createSCIMUser({
				body: { userName: victimUser.email },
				headers: { authorization: `Bearer ${scimToken}` },
			});

			const ctx = await auth.$context;
			const victimSession = await ctx.internalAdapter.createSession(
				provisioned.id,
			);
			expect(store.has(victimSession.token)).toBe(true);

			await auth.api.deleteSCIMUser({
				params: { userId: provisioned.id },
				headers: { authorization: `Bearer ${scimToken}` },
			});

			expect(store.has(victimSession.token)).toBe(false);
		});

		it("should deprovision (not delete the global user) for an org-scoped DELETE", async () => {
			const { auth, getSCIMToken, registerOrganization } = createTestInstance();
			const organization = await registerOrganization("org:deprovision");
			const scimToken = await getSCIMToken(
				"provider-deprovision",
				organization!.id,
			);

			const created = await auth.api.createSCIMUser({
				body: {
					userName: "scim-user",
					emails: [{ value: "scim-user@email.com" }],
				},
				headers: { authorization: `Bearer ${scimToken}` },
			});

			const ctx = await auth.$context;

			const memberBefore = await ctx.adapter.findOne({
				model: "member",
				where: [
					{ field: "organizationId", value: organization!.id },
					{ field: "userId", value: created.id },
				],
			});
			expect(memberBefore).not.toBeNull();

			await auth.api.deleteSCIMUser({
				params: { userId: created.id },
				headers: { authorization: `Bearer ${scimToken}` },
			});

			const userAfter = await ctx.adapter.findOne({
				model: "user",
				where: [{ field: "id", value: created.id }],
			});
			expect(userAfter).not.toBeNull();

			const memberAfter = await ctx.adapter.findOne({
				model: "member",
				where: [
					{ field: "organizationId", value: organization!.id },
					{ field: "userId", value: created.id },
				],
			});
			expect(memberAfter).toBeNull();

			await expect(
				auth.api.getSCIMUser({
					params: { userId: created.id },
					headers: { authorization: `Bearer ${scimToken}` },
				}),
			).rejects.toThrowError(
				expect.objectContaining({ message: "User not found" }),
			);
		});

		it("removes team memberships when an org-scoped SCIM delete removes the member", async () => {
			const adminUser = {
				email: "scim-team-admin@test.com",
				password: "password",
				name: "SCIM Team Admin",
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
				invitation: [],
				team: [],
				teamMember: [],
			};
			const memory = memoryAdapter(data);

			const auth = betterAuth({
				database: memory,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				plugins: [sso(), scim(), organization({ teams: { enabled: true } })],
			});

			const authClient = createAuthClient({
				baseURL: "http://localhost:3000",
				plugins: [bearer(), scimClient()],
				fetchOptions: {
					customFetchImpl: async (url, init) =>
						auth.handler(new Request(url, init)),
				},
			});

			await authClient.signUp.email(adminUser);
			const adminHeaders = new Headers();
			await authClient.signIn.email(adminUser, {
				throw: true,
				onSuccess: setCookieToHeader(adminHeaders),
			});

			const org = await auth.api.createOrganization({
				body: { slug: "the-team-org", name: "the team org" },
				headers: adminHeaders,
			});

			const { scimToken } = await auth.api.generateSCIMToken({
				body: {
					providerId: "provider-team-cleanup",
					organizationId: org!.id,
				},
				headers: adminHeaders,
			});

			const created = await auth.api.createSCIMUser({
				body: {
					userName: "scim-team-user",
					emails: [{ value: "scim-team-user@email.com" }],
				},
				headers: { authorization: `Bearer ${scimToken}` },
			});

			const team = await auth.api.createTeam({
				body: { name: "the-team", organizationId: org!.id },
				headers: adminHeaders,
			});

			await auth.api.addTeamMember({
				body: {
					teamId: team.id,
					userId: created.id,
					organizationId: org!.id,
				},
				headers: adminHeaders,
			});

			const ctx = await auth.$context;

			const teamMemberBefore = await ctx.adapter.findOne({
				model: "teamMember",
				where: [
					{ field: "teamId", value: team.id },
					{ field: "userId", value: created.id },
				],
			});
			expect(teamMemberBefore).not.toBeNull();

			await auth.api.deleteSCIMUser({
				params: { userId: created.id },
				headers: { authorization: `Bearer ${scimToken}` },
			});

			const memberAfter = await ctx.adapter.findOne({
				model: "member",
				where: [
					{ field: "organizationId", value: org!.id },
					{ field: "userId", value: created.id },
				],
			});
			expect(memberAfter).toBeNull();

			const teamMemberAfter = await ctx.adapter.findOne({
				model: "teamMember",
				where: [
					{ field: "teamId", value: team.id },
					{ field: "userId", value: created.id },
				],
			});
			expect(teamMemberAfter).toBeNull();
		});
	});

	describe("Static (app-level) SCIM provider", () => {
		it("should work with a default SCIM provider", async () => {
			const scimToken = "dGhlLXNjaW0tdG9rZW46dGhlLXNjaW0tcHJvdmlkZXI=";
			const { auth } = createTestInstance({
				staticProviders: [
					{
						providerId: "the-scim-provider",
						scimToken: "the-scim-token",
					},
				],
			});

			const createdUser = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(createdUser.id).toBeTruthy();

			const user = await auth.api.getSCIMUser({
				params: {
					userId: createdUser.id,
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toEqual(createdUser);

			const users = await auth.api.listSCIMUsers({
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(users.Resources).toEqual([createdUser]);

			const updatedUser = await auth.api.updateSCIMUser({
				params: {
					userId: user.id,
				},
				body: {
					userName: "new-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(updatedUser.userName).toBe("new-username");

			await expect(
				auth.api.deleteSCIMUser({
					params: {
						userId: user.id,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				}),
			).resolves.toBe(undefined);
		});

		it("rejects org-scoped static provider tokens without the organization segment", async () => {
			const orglessToken = "dGhlLXNjaW0tdG9rZW46dGhlLXNjaW0tcHJvdmlkZXI=";
			const orgToken =
				"dGhlLXNjaW0tdG9rZW46dGhlLXNjaW0tcHJvdmlkZXI6dGhlLW9yZw==";
			const { auth } = createTestInstance({
				staticProviders: [
					{
						providerId: "the-scim-provider",
						scimToken: "the-scim-token",
						organizationId: "the-org",
					},
				],
			});

			await expect(
				auth.api.createSCIMUser({
					body: { userName: "missing-org" },
					headers: { authorization: `Bearer ${orglessToken}` },
				}),
			).rejects.toThrowError(
				expect.objectContaining({ message: "Invalid SCIM token" }),
			);

			const createdUser = await auth.api.createSCIMUser({
				body: { userName: "with-org" },
				headers: { authorization: `Bearer ${orgToken}` },
			});

			expect(createdUser.id).toBeTruthy();
		});

		it("should reject invalid SCIM tokens", async () => {
			const { auth } = createTestInstance({
				staticProviders: [
					{
						providerId: "the-scim-provider",
						scimToken: "the-scim-token",
					},
				],
			});

			const createUser = () =>
				auth.api.createSCIMUser({
					body: {
						userName: "the-username",
					},
					headers: {
						authorization: `Bearer invalid-scim-token`,
					},
				});

			await expect(createUser()).rejects.toThrow(
				expect.objectContaining({
					message: "Invalid SCIM token",
					body: {
						detail: "Invalid SCIM token",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "401",
					},
				}),
			);
		});
	});
});

describe("SCIM write-path access and validation", () => {
	it("unlinks the provider account instead of globally deleting a user with other identities", async () => {
		const { auth, authClient, getSCIMToken } = createTestInstance({
			linkExistingUsers: true,
		});
		const scimToken = await getSCIMToken("scim-a");

		await authClient.signUp.email({
			email: "victim@email.com",
			password: "the password",
			name: "victim",
		});

		const provisioned = await auth.api.createSCIMUser({
			body: { userName: "victim", emails: [{ value: "victim@email.com" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});

		await auth.api.deleteSCIMUser({
			params: { userId: provisioned.id },
			headers: { authorization: `Bearer ${scimToken}` },
		});

		const ctx = await auth.$context;
		const user = await ctx.adapter.findOne({
			model: "user",
			where: [{ field: "id", value: provisioned.id }],
		});
		expect(user).not.toBeNull();

		const accounts = await ctx.internalAdapter.findAccounts(provisioned.id);
		const [, , organizationId] = Buffer.from(scimToken, "base64")
			.toString("utf8")
			.split(":");
		expect(
			accounts.some((a) => a.providerId === `scim:${organizationId}:scim-a`),
		).toBe(false);
		expect(accounts.some((a) => a.providerId === "credential")).toBe(true);
	});

	it("deprovisions from the organization without deleting the global user", async () => {
		const { auth, getSCIMToken } = createTestInstance();
		const scimToken = await getSCIMToken("scim-a");

		const provisioned = await auth.api.createSCIMUser({
			body: { userName: "solo", emails: [{ value: "solo@email.com" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});

		await auth.api.deleteSCIMUser({
			params: { userId: provisioned.id },
			headers: { authorization: `Bearer ${scimToken}` },
		});

		const ctx = await auth.$context;
		const user = await ctx.adapter.findOne({
			model: "user",
			where: [{ field: "id", value: provisioned.id }],
		});
		expect(user).not.toBeNull();
		const members = await ctx.adapter.findMany({
			model: "member",
			where: [{ field: "userId", value: provisioned.id }],
		});
		expect(members).toHaveLength(0);
	});

	it("resets emailVerified when a SCIM email change is applied", async () => {
		const { auth, getSCIMToken } = createTestInstance();
		const scimToken = await getSCIMToken("scim-a");

		const provisioned = await auth.api.createSCIMUser({
			body: { userName: "before", emails: [{ value: "before@email.com" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});

		const ctx = await auth.$context;
		await ctx.internalAdapter.updateUser(provisioned.id, {
			emailVerified: true,
		});

		await auth.api.updateSCIMUser({
			params: { userId: provisioned.id },
			body: { userName: "after", emails: [{ value: "after@email.com" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});

		const user = await ctx.adapter.findOne<{ emailVerified: boolean }>({
			model: "user",
			where: [{ field: "id", value: provisioned.id }],
		});
		expect(user?.emailVerified).toBe(false);
	});

	it("rejects reassigning an email another user already holds with a 409 uniqueness conflict", async () => {
		const { auth, getSCIMToken } = createTestInstance();
		const scimToken = await getSCIMToken("scim-a");

		await auth.api.createSCIMUser({
			body: { userName: "user-a", emails: [{ value: "a@email.com" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});
		const userB = await auth.api.createSCIMUser({
			body: { userName: "user-b", emails: [{ value: "b@email.com" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});

		await expect(
			auth.api.updateSCIMUser({
				params: { userId: userB.id },
				body: { userName: "user-b", emails: [{ value: "a@email.com" }] },
				headers: { authorization: `Bearer ${scimToken}` },
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				body: expect.objectContaining({
					scimType: "uniqueness",
					status: "409",
				}),
			}),
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-rjg6
	 */
	it("deactivates by removing organization membership and reactivates with preserved SCIM group roles", async () => {
		const { auth, getSCIMToken } = createTestInstance();
		const scimToken = await getSCIMToken("scim-a");

		const provisioned = await auth.api.createSCIMUser({
			body: { userName: "deact", emails: [{ value: "deact@email.com" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});
		expect(provisioned.active).toBe(true);

		await auth.api.createSCIMGroup({
			body: {
				displayName: "admin",
				members: [{ value: provisioned.id }],
			},
			headers: { authorization: `Bearer ${scimToken}` },
		});
		const ctx = await auth.$context;
		const memberBeforeDeactivate = await ctx.adapter.findOne<{ role: string }>({
			model: "member",
			where: [{ field: "userId", value: provisioned.id }],
		});
		expect(memberBeforeDeactivate?.role.split(",").sort()).toEqual([
			"admin",
			"member",
		]);

		const deactivated = await auth.api.updateSCIMUser({
			params: { userId: provisioned.id },
			body: {
				userName: "deact",
				emails: [{ value: "deact@email.com" }],
				active: false,
			},
			headers: { authorization: `Bearer ${scimToken}` },
		});
		expect(deactivated.active).toBe(false);

		const user = await ctx.adapter.findOne({
			model: "user",
			where: [{ field: "id", value: provisioned.id }],
		});
		expect(user).not.toBeNull();
		const membersAfterDeactivate = await ctx.adapter.findMany({
			model: "member",
			where: [{ field: "userId", value: provisioned.id }],
		});
		expect(membersAfterDeactivate).toHaveLength(0);
		const groupMembersAfterDeactivate = await ctx.adapter.findMany({
			model: "scimGroupMember",
			where: [{ field: "userId", value: provisioned.id }],
		});
		expect(groupMembersAfterDeactivate).toHaveLength(1);

		const fetched = await auth.api.getSCIMUser({
			params: { userId: provisioned.id },
			headers: { authorization: `Bearer ${scimToken}` },
		});
		expect(fetched.active).toBe(false);

		await auth.api.patchSCIMUser({
			params: { userId: provisioned.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [{ op: "replace", path: "/active", value: true }],
			},
			headers: { authorization: `Bearer ${scimToken}` },
		});

		const membersAfterReactivate = await ctx.adapter.findMany<{ role: string }>(
			{
				model: "member",
				where: [{ field: "userId", value: provisioned.id }],
			},
		);
		expect(membersAfterReactivate).toHaveLength(1);
		expect(membersAfterReactivate[0]?.role.split(",").sort()).toEqual([
			"admin",
			"member",
		]);
		const refetched = await auth.api.getSCIMUser({
			params: { userId: provisioned.id },
			headers: { authorization: `Bearer ${scimToken}` },
		});
		expect(refetched.active).toBe(true);
	});

	it("normalizes email casing when checking uniqueness on update", async () => {
		const { auth, getSCIMToken } = createTestInstance();
		const scimToken = await getSCIMToken("scim-a");

		await auth.api.createSCIMUser({
			body: { userName: "user-a", emails: [{ value: "a@email.com" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});
		const userB = await auth.api.createSCIMUser({
			body: { userName: "user-b", emails: [{ value: "b@email.com" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});

		await expect(
			auth.api.updateSCIMUser({
				params: { userId: userB.id },
				body: { userName: "user-b", emails: [{ value: "A@Email.com" }] },
				headers: { authorization: `Bearer ${scimToken}` },
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				body: expect.objectContaining({
					scimType: "uniqueness",
					status: "409",
				}),
			}),
		);
	});

	it("provisions a user without organization membership when created with active:false", async () => {
		const { auth, getSCIMToken } = createTestInstance();
		const scimToken = await getSCIMToken("scim-a");

		const created = await auth.api.createSCIMUser({
			body: {
				userName: "born-off",
				emails: [{ value: "born-off@email.com" }],
				active: false,
			},
			headers: { authorization: `Bearer ${scimToken}` },
		});
		expect(created.active).toBe(false);

		const ctx = await auth.$context;
		const members = await ctx.adapter.findMany({
			model: "member",
			where: [{ field: "userId", value: created.id }],
		});
		expect(members).toHaveLength(0);

		const fetched = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers: { authorization: `Bearer ${scimToken}` },
		});
		expect(fetched.active).toBe(false);
	});
});
