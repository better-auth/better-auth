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
	describe("PATCH /scim/v2/users", () => {
		it.for([
			"replace",
			"add",
		])("should partially update a user resource with %s", async (op) => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						formatted: "Juan Perez",
					},
					emails: [{ value: "primary-email@test.com", primary: true }],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toBeTruthy();
			expect(user.externalId).toBe("the-username");
			expect(user.userName).toBe("primary-email@test.com");
			expect(user.name.formatted).toBe("Juan Perez");
			expect(user.emails[0]?.value).toBe("primary-email@test.com");

			await auth.api.patchSCIMUser({
				params: {
					userId: user.id,
				},
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{ op: op, path: "/externalId", value: "external-username" },
						{ op: op, path: "/userName", value: "other-username" },
						{ op: op, path: "/name/givenName", value: "Daniel" },
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const updatedUser = await auth.api.getSCIMUser({
				params: {
					userId: user.id,
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(updatedUser).toMatchObject({
				active: true,
				displayName: "Daniel Perez",
				emails: [
					{
						primary: true,
						value: "other-username",
					},
				],
				externalId: "external-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/api/auth/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Daniel Perez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "other-username",
			});
		});

		it("should partially update a user resource with mixed operations", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						formatted: "Juan Perez",
					},
					emails: [{ value: "primary-email@test.com", primary: true }],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toBeTruthy();
			expect(user.externalId).toBe("the-username");
			expect(user.userName).toBe("primary-email@test.com");
			expect(user.name.formatted).toBe("Juan Perez");
			expect(user.emails[0]?.value).toBe("primary-email@test.com");

			await auth.api.patchSCIMUser({
				params: {
					userId: user.id,
				},
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{ op: "add", path: "/externalId", value: "external-username" },
						{ op: "replace", path: "/userName", value: "other-username" },
						{ op: "add", path: "/name/formatted", value: "Daniel Lopez" },
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const updatedUser = await auth.api.getSCIMUser({
				params: {
					userId: user.id,
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(updatedUser).toMatchObject({
				active: true,
				displayName: "Daniel Lopez",
				emails: [
					{
						primary: true,
						value: "other-username",
					},
				],
				externalId: "external-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/api/auth/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Daniel Lopez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "other-username",
			});
		});

		it.for([
			"replace",
			"add",
		])("should partially update multiple name sub-attributes with %s", async (op) => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "sub-attribute-test-user",
					name: {
						formatted: "Original Name",
					},
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			await auth.api.patchSCIMUser({
				params: { userId: user.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{ op: op, path: "/name/givenName", value: "Updated" },
						{ op: op, path: "/name/familyName", value: "Value" },
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const updatedUser = await auth.api.getSCIMUser({
				params: { userId: user.id },
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(updatedUser.name.formatted).toBe("Updated Value");
		});

		it.for([
			"replace",
			"add",
		])("should %s nested object values with path prefix", async (op) => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "nested-test-user",
					name: { formatted: "Original Name" },
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			await auth.api.patchSCIMUser({
				params: { userId: user.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{
							op: op,
							path: "name",
							value: { givenName: "Nested" },
						},
						{
							op: op,
							path: "name",
							value: { familyName: "User" },
						},
						{
							op: op,
							path: "userName",
							value: "nested-test-user-updated",
						},
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const updatedUser = await auth.api.getSCIMUser({
				params: { userId: user.id },
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(updatedUser.name.formatted).toBe("Nested User");
			expect(updatedUser.displayName).toBe("Nested User");
			expect(updatedUser.userName).toBe("nested-test-user-updated");
		});

		it.for([
			"replace",
			"add",
		])("should support operations without explicit path with %s", async (op) => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "no-path-test-user",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			await auth.api.patchSCIMUser({
				params: { userId: user.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{
							op: op,
							value: {
								name: { formatted: "No Path Name" },
								userName: "Username",
							},
						},
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const updatedUser = await auth.api.getSCIMUser({
				params: { userId: user.id },
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(updatedUser.name.formatted).toBe("No Path Name");
			expect(updatedUser.userName).toBe("username");
		});

		it("should support dot notation in paths", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "dot-notation-user",
					name: { formatted: "Original Name" },
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			await auth.api.patchSCIMUser({
				params: { userId: user.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{ op: "replace", path: "name.familyName", value: "Dot" },
						{ op: "add", path: "name.givenName", value: "User" },
						{ op: "add", path: "userName", value: "Username" },
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const updatedUser = await auth.api.getSCIMUser({
				params: { userId: user.id },
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(updatedUser.name.formatted).toBe("User Dot");
			expect(updatedUser.userName).toBe("username");
		});

		it.for([
			"replace",
			"add",
		])("should handle %s operation case-insensitively", async (op) => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "user-case-insensitive",
					name: { formatted: "Original" },
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			await auth.api.patchSCIMUser({
				params: { userId: user.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{
							op: op.toUpperCase(),
							path: "name.formatted",
							value: "user-case",
						},
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const updatedUser = await auth.api.getSCIMUser({
				params: { userId: user.id },
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(updatedUser.name.formatted).toBe("user-case");
		});

		it("should skip add operation when value already exists", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "add-same-info-user",
					name: { formatted: "Existing Name" },
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const patchUser = () =>
				auth.api.patchSCIMUser({
					params: { userId: user.id },
					body: {
						schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
						Operations: [
							{ op: "add", path: "/name/formatted", value: "Existing Name" },
						],
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(patchUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "No valid fields to update",
					body: {
						detail: "No valid fields to update",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "400",
					},
				}),
			);
		});

		it.for([
			"replace",
			"add",
		])("should ignore %s on non-existing path", async (op) => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "non-existing-path",
					name: { formatted: "Original Name" },
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const patchUser = () =>
				auth.api.patchSCIMUser({
					params: { userId: user.id },
					body: {
						schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
						Operations: [
							{ op: op, path: "/nonExistentField", value: "Some Value" },
						],
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(patchUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "No valid fields to update",
					body: {
						detail: "No valid fields to update",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "400",
					},
				}),
			);
		});

		it("should ignore non-existing operation", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "non-existing-operation",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const patchUser = () =>
				auth.api.patchSCIMUser({
					params: { userId: user.id },
					body: {
						schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
						Operations: [
							{ op: "update", path: "userName", value: "Some Value" },
						],
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(patchUser()).rejects.toThrowError(
				expect.objectContaining({
					body: {
						code: "VALIDATION_ERROR",
						message:
							'[body.Operations.0.op] Invalid option: expected one of "replace"|"add"|"remove"',
					},
				}),
			);
		});

		it("should return not found for missing users", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const patchUser = () =>
				auth.api.patchSCIMUser({
					params: {
						userId: "missing",
					},
					body: {
						schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
						Operations: [
							{
								op: "replace",
								path: "/externalId",
								value: "external-username",
							},
						],
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(patchUser()).rejects.toThrowError(
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

		it("should fail on invalid updates", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const patchUser = () =>
				auth.api.patchSCIMUser({
					params: {
						userId: user.id,
					},
					body: {
						schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
						Operations: [],
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(patchUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "No valid fields to update",
					body: {
						detail: "No valid fields to update",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "400",
					},
				}),
			);
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const patchUser = async () => {
				await auth.api.patchSCIMUser({
					params: {
						userId: "missing",
					},
					body: {
						schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
						Operations: [
							{
								op: "replace",
								path: "/externalId",
								value: "external-username",
							},
						],
					},
				});
			};

			await expect(patchUser()).rejects.toThrowError(
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
});
