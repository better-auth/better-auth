import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { bearer, organization } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { scimClient } from "./client.js";
import { scim } from "./index.js";
import type { SCIMOptions } from "./types.js";

const createTestInstance = (scimOptions?: SCIMOptions) => {
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
		plugins: [sso(), scim(scimOptions), organization()],
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
