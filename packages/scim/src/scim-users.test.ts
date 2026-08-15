import { sso } from "@better-auth/sso";
import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { admin, bearer, organization } from "better-auth/plugins";
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

	async function getSCIMToken(
		providerId: string = "the-saml-provider-1",
		organizationId?: string,
	) {
		const headers = await getAuthCookieHeaders();
		const { scimToken } = await auth.api.generateSCIMToken({
			body: {
				providerId,
				organizationId,
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
				getSCIMToken("provider-org-a", organizationA?.id),
				getSCIMToken("provider-org-b", organizationB?.id),
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
				getSCIMToken("provider-a", organizationA?.id),
				getSCIMToken("provider-b", organizationB?.id),
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
					filter: 'userName eq "user-A"',
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
				getSCIMToken("provider-a", organizationA?.id),
				getSCIMToken("provider-b", organizationB?.id),
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

			const { scimToken } = await auth.api.generateSCIMToken({
				body: { providerId: "the-saml-provider-1" },
				headers: adminHeaders,
			});

			const provisioned = await auth.api.createSCIMUser({
				body: { userName: victimUser.email },
				headers: { authorization: `Bearer ${scimToken}` },
			});

			// The SCIM provider is the victim's sole identity, so a SCIM delete
			// removes the global user and must also clear their stored sessions.
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
				organization?.id,
			);

			const created = await auth.api.createSCIMUser({
				body: {
					userName: "scim-user",
					emails: [{ value: "scim-user@email.com" }],
				},
				headers: { authorization: `Bearer ${scimToken}` },
			});

			const ctx = await auth.$context;

			// SCIM provisioning created an org membership for the new user.
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

			// The global Better Auth user must NOT be deleted by an org-scoped token.
			const userAfter = await ctx.adapter.findOne({
				model: "user",
				where: [{ field: "id", value: created.id }],
			});
			expect(userAfter).not.toBeNull();

			// The org membership is removed (deprovisioned).
			const memberAfter = await ctx.adapter.findOne({
				model: "member",
				where: [
					{ field: "organizationId", value: organization!.id },
					{ field: "userId", value: created.id },
				],
			});
			expect(memberAfter).toBeNull();

			// The SCIM account link is removed, so the user is no longer
			// reachable through this provider.
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

	describe("Default SCIM provider", () => {
		it("should work with a default SCIM provider", async () => {
			const scimToken = "dGhlLXNjaW0tdG9rZW46dGhlLXNjaW0tcHJvdmlkZXI="; // base64(scimToken:providerId)
			const { auth } = createTestInstance({
				defaultSCIM: [
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

		it("should reject invalid SCIM tokens", async () => {
			const { auth } = createTestInstance({
				defaultSCIM: [
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
		expect(accounts.some((a) => a.providerId === "scim-a")).toBe(false);
		expect(accounts.some((a) => a.providerId === "credential")).toBe(true);
	});

	it("deletes the global user when this provider's account is their sole identity", async () => {
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
		expect(user).toBeNull();
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

	it("honors active:false by banning the user and reporting the real state (admin plugin)", async () => {
		const { auth, getSCIMToken } = createTestInstance(undefined, [admin()]);
		const scimToken = await getSCIMToken("scim-a");

		const provisioned = await auth.api.createSCIMUser({
			body: { userName: "deact", emails: [{ value: "deact@email.com" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});

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

		const ctx = await auth.$context;
		const banned = await ctx.adapter.findOne<{
			banned: boolean;
			banReason: string | null;
		}>({
			model: "user",
			where: [{ field: "id", value: provisioned.id }],
		});
		expect(banned?.banned).toBe(true);
		expect(banned?.banReason).toBeTruthy();

		const reactivated = await auth.api.patchSCIMUser({
			params: { userId: provisioned.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [{ op: "replace", path: "/active", value: true }],
			},
			headers: { authorization: `Bearer ${scimToken}` },
		});
		expect(reactivated).toBeUndefined();

		const cleared = await ctx.adapter.findOne<{
			banned: boolean;
			banReason: string | null;
		}>({
			model: "user",
			where: [{ field: "id", value: provisioned.id }],
		});
		expect(cleared?.banned).toBe(false);
		expect(cleared?.banReason).toBeFalsy();
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

	it("rejects active:false rather than silently dropping it when the admin plugin is absent", async () => {
		const { auth, getSCIMToken } = createTestInstance();
		const scimToken = await getSCIMToken("scim-a");

		const provisioned = await auth.api.createSCIMUser({
			body: { userName: "noadmin", emails: [{ value: "noadmin@email.com" }] },
			headers: { authorization: `Bearer ${scimToken}` },
		});

		await expect(
			auth.api.updateSCIMUser({
				params: { userId: provisioned.id },
				body: {
					userName: "noadmin",
					emails: [{ value: "noadmin@email.com" }],
					active: false,
				},
				headers: { authorization: `Bearer ${scimToken}` },
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				body: expect.objectContaining({
					detail: expect.stringContaining("admin plugin"),
					status: "400",
				}),
			}),
		);
	});

	it("provisions a deactivated user when created with active:false (admin plugin)", async () => {
		const { auth, getSCIMToken } = createTestInstance(undefined, [admin()]);
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
		const user = await ctx.adapter.findOne<{ banned: boolean }>({
			model: "user",
			where: [{ field: "id", value: created.id }],
		});
		expect(user?.banned).toBe(true);
	});

	it("rejects create with active:false before persisting when the admin plugin is absent", async () => {
		const { auth, getSCIMToken } = createTestInstance();
		const scimToken = await getSCIMToken("scim-a");

		await expect(
			auth.api.createSCIMUser({
				body: {
					userName: "never",
					emails: [{ value: "never@email.com" }],
					active: false,
				},
				headers: { authorization: `Bearer ${scimToken}` },
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				body: expect.objectContaining({
					detail: expect.stringContaining("admin plugin"),
					status: "400",
				}),
			}),
		);

		const ctx = await auth.$context;
		const user = await ctx.adapter.findOne({
			model: "user",
			where: [{ field: "email", value: "never@email.com" }],
		});
		expect(user).toBeNull();
	});

	it("revokes sessions when create links and deactivates a pre-existing user", async () => {
		const { auth, authClient, getSCIMToken } = createTestInstance(
			{ linkExistingUsers: true },
			[admin()],
		);
		const scimToken = await getSCIMToken("scim-a");

		await authClient.signUp.email({
			email: "existing@email.com",
			password: "the password",
			name: "existing",
		});

		const ctx = await auth.$context;
		const existing = await ctx.adapter.findOne<{ id: string }>({
			model: "user",
			where: [{ field: "email", value: "existing@email.com" }],
		});
		await ctx.internalAdapter.createSession(existing!.id);

		await auth.api.createSCIMUser({
			body: {
				userName: "existing",
				emails: [{ value: "existing@email.com" }],
				active: false,
			},
			headers: { authorization: `Bearer ${scimToken}` },
		});

		const sessions = await ctx.adapter.findMany({
			model: "session",
			where: [{ field: "userId", value: existing!.id }],
		});
		expect(sessions).toHaveLength(0);

		const banned = await ctx.adapter.findOne<{ banned: boolean }>({
			model: "user",
			where: [{ field: "id", value: existing!.id }],
		});
		expect(banned?.banned).toBe(true);
	});
});
