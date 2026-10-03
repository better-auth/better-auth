import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMUser } from "./persistence";

const PATCH_OP_SCHEMA =
	"urn:ietf:params:scim:api:messages:2.0:PatchOp" as const;
const SCIM_MEDIA_TYPE = "application/scim+json";

function createTestContext() {
	const data = {
		user: [] as User[],
		session: [] as { id: string }[],
		verification: [] as { id: string }[],
		account: [] as { id: string }[],
		scimConnectionBinding: [] as { id: string }[],
		scimIdentityTombstone: [] as { id: string }[],
		scimSubject: [] as { id: string; userId: string }[],
		scimUser: [] as SCIMUser[],
		scimGroupMember: [] as { id: string }[],
		scimProjectionGrant: [] as { id: string }[],
	};
	let identityResolutionCount = 0;
	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		database: memoryAdapter(data),
		plugins: [
			scim({
				connections: [
					{
						id: "workforce",
						credentials: [
							{
								type: "bearer",
								id: "test-scim-token",
								token: "test-scim-token",
							},
						],
					},
				],
				identity: {
					resolveUser() {
						identityResolutionCount += 1;
						return { action: "create" };
					},
				},
			}),
		],
	});

	return {
		auth,
		data,
		headers: { authorization: "Bearer test-scim-token" },
		getIdentityResolutionCount: () => identityResolutionCount,
	};
}

function getPersistedUser(
	data: ReturnType<typeof createTestContext>["data"],
	scimUserId: string,
) {
	const scimUser = data.scimUser.find(
		(candidate) => candidate.id === scimUserId,
	);
	if (!scimUser) throw new Error("Expected a persisted SCIM User");
	const user = data.user.find((candidate) => candidate.id === scimUser.userId);
	if (!user) throw new Error("Expected a backing Better Auth User");
	return { scimUser, user };
}

/**
 * @see https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups#update-user-multi-valued-properties
 */
describe("SCIM User PATCH provider compatibility", () => {
	it("applies ordered Entra-style replacements to the canonical and backing Users", async () => {
		const { auth, data, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada.login@example.com",
				name: { formatted: "Ada Lovelace" },
				emails: [
					{
						value: "ada.primary@example.com",
						type: "work",
						primary: true,
					},
				],
				externalId: "directory-user-1",
			},
			headers,
		});
		const original = getPersistedUser(data, created.id);

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "Replace",
						path: "userName",
						value: "augusta.login@example.com",
					},
					{
						op: "Replace",
						path: "name.formatted",
						value: "Augusta Ada King",
					},
					{
						op: "Replace",
						path: 'emails[type eq "work"].value',
						value: "augusta.primary@example.com",
					},
				],
			},
			headers,
		});

		const retrieved = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		const persisted = getPersistedUser(data, created.id);

		expect(retrieved).toMatchObject({
			id: created.id,
			userName: "augusta.login@example.com",
			name: { formatted: "Augusta Ada King" },
			displayName: "Augusta Ada King",
			externalId: "directory-user-1",
			emails: [{ primary: true, value: "augusta.primary@example.com" }],
		});
		expect(persisted.scimUser).toMatchObject({
			id: created.id,
			connectionId: "workforce",
			userId: original.scimUser.userId,
			userName: "augusta.login@example.com",
			primaryEmail: "augusta.primary@example.com",
			displayName: "Augusta Ada King",
			externalId: "directory-user-1",
		});
		expect(persisted.user).toMatchObject({
			id: original.user.id,
			email: "augusta.primary@example.com",
			name: "Augusta Ada King",
		});
	});

	it("replaces the value subattribute on every selected email record", async () => {
		const { auth, data, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "multi-email@example.com",
				emails: [
					{
						value: "home@example.com",
						type: "home",
						primary: true,
					},
					{ value: "work@example.com", type: "work" },
				],
			},
			headers,
		});

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "replace",
						path: "emails.value",
						value: "shared@example.com",
					},
				],
			},
			headers,
		});

		const retrieved = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		const persisted = getPersistedUser(data, created.id);
		expect(retrieved.emails).toEqual([
			{ value: "shared@example.com", type: "home", primary: true },
			{ value: "shared@example.com", type: "work", primary: false },
		]);
		expect(persisted.scimUser.primaryEmail).toBe("shared@example.com");
		expect(persisted.user.email).toBe("shared@example.com");
	});

	it("creates a missing work email for add and replace and treats a missing filtered removal as a no-op", async () => {
		const { auth, data, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "typed-email@example.com",
				emails: [
					{
						value: "home@example.com",
						type: "home",
						primary: true,
					},
				],
			},
			headers,
		});

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "add",
						path: 'emails[type eq "work"].value',
						value: "work@example.com",
					},
				],
			},
			headers,
		});
		const withWorkEmail = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		expect(withWorkEmail.emails).toEqual([
			{ value: "home@example.com", type: "home", primary: true },
			{ value: "work@example.com", type: "work", primary: false },
		]);

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [{ op: "remove", path: 'emails[type eq "work"].value' }],
			},
			headers,
		});
		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "replace",
						path: 'emails[type eq "work"].value',
						value: "replacement@example.com",
					},
				],
			},
			headers,
		});
		const withReplacedWorkEmail = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		expect(withReplacedWorkEmail.emails).toEqual([
			{ value: "home@example.com", type: "home", primary: true },
			{ value: "replacement@example.com", type: "work", primary: false },
		]);

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [{ op: "remove", path: 'emails[type eq "work"].value' }],
			},
			headers,
		});
		const updatedAtAfterRemoval = getPersistedUser(data, created.id).scimUser
			.updatedAt;
		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [{ op: "remove", path: 'emails[type eq "work"].value' }],
			},
			headers,
		});
		expect(getPersistedUser(data, created.id).scimUser.updatedAt).toEqual(
			updatedAtAfterRemoval,
		);
	});

	it("adds, replaces, and removes a non-work typed email through the filtered path", async () => {
		const { auth, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "home-email@example.com",
				emails: [
					{
						value: "work@example.com",
						type: "work",
						primary: true,
					},
				],
			},
			headers,
		});

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "add",
						path: 'emails[type eq "home"].value',
						value: "home@example.com",
					},
				],
			},
			headers,
		});
		const withHomeEmail = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		expect(withHomeEmail.emails).toEqual([
			{ value: "work@example.com", type: "work", primary: true },
			{ value: "home@example.com", type: "home", primary: false },
		]);

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "replace",
						path: 'emails[type eq "home"].value',
						value: "home-updated@example.com",
					},
				],
			},
			headers,
		});
		const withReplacedHomeEmail = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		expect(withReplacedHomeEmail.emails).toEqual([
			{ value: "work@example.com", type: "work", primary: true },
			{ value: "home-updated@example.com", type: "home", primary: false },
		]);

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [{ op: "remove", path: 'emails[type eq "home"].value' }],
			},
			headers,
		});
		const finalResource = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		expect(finalResource.emails).toEqual([
			{ value: "work@example.com", type: "work", primary: true },
		]);
	});

	it("appends email tuples and treats duplicate additions as a no-op", async () => {
		const { auth, data, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "append-email@example.com",
				emails: [
					{
						value: "home@example.com",
						type: "home",
						primary: true,
					},
				],
			},
			headers,
		});

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "add",
						path: "emails",
						value: [{ value: "work@example.com", type: "work" }],
					},
				],
			},
			headers,
		});
		const appended = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		expect(appended.emails).toEqual([
			{ value: "home@example.com", type: "home", primary: true },
			{ value: "work@example.com", type: "work", primary: false },
		]);
		expect(getPersistedUser(data, created.id).user.email).toBe(
			"home@example.com",
		);

		const updatedAtAfterAppend = getPersistedUser(data, created.id).scimUser
			.updatedAt;
		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "add",
						value: {
							emails: [
								{ value: "WORK@example.com", type: "WORK" },
								{ value: "work@example.com", type: "work" },
							],
						},
					},
				],
			},
			headers,
		});
		expect(getPersistedUser(data, created.id).scimUser.updatedAt).toEqual(
			updatedAtAfterAppend,
		);
	});

	it("makes a newly appended explicit primary email authoritative", async () => {
		const { auth, data, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "new-primary@example.com",
				emails: [
					{
						value: "old-primary@example.com",
						type: "home",
						primary: true,
					},
				],
			},
			headers,
		});

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "add",
						path: "emails",
						value: [
							{
								value: "new-primary@example.com",
								type: "work",
								primary: true,
							},
						],
					},
				],
			},
			headers,
		});

		const updated = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		expect(updated.emails).toEqual([
			{ value: "old-primary@example.com", type: "home", primary: false },
			{ value: "new-primary@example.com", type: "work", primary: true },
		]);
		expect(getPersistedUser(data, created.id).user.email).toBe(
			"new-primary@example.com",
		);
	});

	it("rejects duplicate email types atomically across HTTP PATCH shapes", async () => {
		const { auth, data, getIdentityResolutionCount, headers } =
			createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "patch-type-collision@example.com",
				emails: [
					{
						value: "home@example.com",
						type: "home",
						primary: true,
					},
					{ value: "work@example.com", type: "work" },
				],
			},
			headers,
		});
		const resourceURL = `http://localhost:3000/api/auth/scim/v2/Users/${encodeURIComponent(
			created.id,
		)}`;
		const resourceBefore = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		const persistedBefore = getPersistedUser(data, created.id);
		const serializedAttributesBefore =
			persistedBefore.scimUser.serializedAttributes;
		const backingUserBefore = { ...persistedBefore.user };
		const callbackCountBefore = getIdentityResolutionCount();
		const operationSets = [
			[
				{
					op: "add",
					path: "emails",
					value: [{ value: "second-work@example.com", type: "Work" }],
				},
			],
			[
				{
					op: "replace",
					path: "emails",
					value: [
						{
							value: "home@example.com",
							type: "home",
							primary: true,
						},
						{ value: "first-work@example.com", type: "Work" },
						{ value: "second-work@example.com", type: "work" },
					],
				},
			],
			[
				{
					op: "add",
					value: {
						emails: [{ value: "pathless-work@example.com", type: "Work" }],
					},
				},
			],
		] as const;

		for (const Operations of operationSets) {
			const response = await auth.handler(
				new Request(resourceURL, {
					method: "PATCH",
					headers: {
						...headers,
						accept: SCIM_MEDIA_TYPE,
						"content-type": SCIM_MEDIA_TYPE,
					},
					body: JSON.stringify({
						schemas: [PATCH_OP_SCHEMA],
						Operations,
					}),
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				scimType: "invalidValue",
			});
			expect(
				await auth.api.getSCIMUser({
					params: { userId: created.id },
					headers,
				}),
			).toEqual(resourceBefore);
			const persistedAfter = getPersistedUser(data, created.id);
			expect(persistedAfter.scimUser.serializedAttributes).toBe(
				serializedAttributesBefore,
			);
			expect(persistedAfter.user).toEqual(backingUserBefore);
			expect(getIdentityResolutionCount()).toBe(callbackCountBefore);
		}
	});

	it("rejects an email replacement with a duplicate type and value tuple", async () => {
		const { auth, data, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "duplicate-email@example.com",
				emails: [
					{
						value: "home@example.com",
						type: "home",
						primary: true,
					},
					{
						value: "work@example.com",
						type: "work",
					},
				],
			},
			headers,
		});
		const resourceBefore = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		const persistedBefore = getPersistedUser(data, created.id);

		await expect(
			auth.api.patchSCIMUser({
				params: { userId: created.id },
				body: {
					schemas: [PATCH_OP_SCHEMA],
					Operations: [
						{
							op: "replace",
							path: "emails",
							value: [
								{
									value: "home@example.com",
									type: "home",
									primary: true,
								},
								{ value: "duplicate@example.com" },
								{ value: "duplicate@example.com" },
							],
						},
					],
				},
				headers,
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				statusCode: 400,
				body: expect.objectContaining({ scimType: "invalidValue" }),
			}),
		);

		const resourceAfter = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		const persistedAfter = getPersistedUser(data, created.id);
		expect(resourceAfter).toEqual(resourceBefore);
		expect(persistedAfter.scimUser.serializedAttributes).toBe(
			persistedBefore.scimUser.serializedAttributes,
		);
		expect(persistedAfter.user.email).toBe(persistedBefore.user.email);
	});

	it("rejects emails.value replacements that collapse distinct email tuples", async () => {
		const { auth, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "tuple-collision@example.com",
				emails: [
					{
						value: "primary-work@example.com",
						primary: true,
					},
					{ value: "secondary-work@example.com" },
				],
			},
			headers,
		});
		const resourceBefore = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});

		await expect(
			auth.api.patchSCIMUser({
				params: { userId: created.id },
				body: {
					schemas: [PATCH_OP_SCHEMA],
					Operations: [
						{
							op: "replace",
							path: "emails.value",
							value: "collision@example.com",
						},
					],
				},
				headers,
			}),
		).rejects.toMatchObject({
			statusCode: 400,
			body: expect.objectContaining({ scimType: "invalidValue" }),
		});

		await expect(
			auth.api.getSCIMUser({
				params: { userId: created.id },
				headers,
			}),
		).resolves.toEqual(resourceBefore);
	});

	it("preserves explicitly supplied formatted and display names when patching one name part", async () => {
		const { auth, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "explicit-name@example.com",
				displayName: "Ada Lovelace",
				name: {
					formatted: "Ada Lovelace",
					givenName: "Ada",
					familyName: "Lovelace",
				},
			},
			headers,
		});

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "replace",
						path: "name.givenName",
						value: "Augusta",
					},
				],
			},
			headers,
		});

		await expect(
			auth.api.getSCIMUser({
				params: { userId: created.id },
				headers,
			}),
		).resolves.toMatchObject({
			displayName: "Ada Lovelace",
			name: {
				formatted: "Ada Lovelace",
				givenName: "Augusta",
				familyName: "Lovelace",
			},
		});
	});

	it("rejects whitespace inside a simple PATCH attribute path", async () => {
		const { auth, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "path-whitespace@example.com",
			},
			headers,
		});

		await expect(
			auth.api.patchSCIMUser({
				params: { userId: created.id },
				body: {
					schemas: [PATCH_OP_SCHEMA],
					Operations: [
						{
							op: "replace",
							path: "user Name",
							value: "unexpected@example.com",
						},
					],
				},
				headers,
			}),
		).rejects.toMatchObject({
			statusCode: 400,
			body: expect.objectContaining({ scimType: "invalidPath" }),
		});
	});

	it("rejects a PATCH attribute path with a trailing empty segment", async () => {
		const { auth, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "path-trailing-dot@example.com",
				name: { formatted: "Original Name" },
			},
			headers,
		});

		await expect(
			auth.api.patchSCIMUser({
				params: { userId: created.id },
				body: {
					schemas: [PATCH_OP_SCHEMA],
					Operations: [
						{
							op: "replace",
							path: "name.",
							value: { formatted: "Unexpected Name" },
						},
					],
				},
				headers,
			}),
		).rejects.toMatchObject({
			statusCode: 400,
			body: expect.objectContaining({ scimType: "invalidPath" }),
		});

		const resource = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		expect(resource.name).toMatchObject({ formatted: "Original Name" });
	});

	it("atomically applies pathless object updates and removes externalId", async () => {
		const { auth, data, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "initial.login@example.com",
				name: { formatted: "Initial Name" },
				emails: [
					{
						value: "initial.primary@example.com",
						primary: true,
					},
				],
				externalId: "directory-user-2",
			},
			headers,
		});
		const original = getPersistedUser(data, created.id);

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "replace",
						value: {
							userName: "pathless.login@example.com",
							name: { formatted: "Pathless Replacement" },
							active: false,
						},
					},
					{
						op: "add",
						value: {
							emails: [
								{
									value: "pathless.primary@example.com",
									primary: true,
								},
							],
						},
					},
					{ op: "remove", path: "externalId" },
				],
			},
			headers,
		});

		const retrieved = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		const persisted = getPersistedUser(data, created.id);

		expect(retrieved).toMatchObject({
			id: created.id,
			userName: "pathless.login@example.com",
			name: { formatted: "Pathless Replacement" },
			displayName: "Pathless Replacement",
			active: false,
			emails: [
				{ primary: false, value: "initial.primary@example.com" },
				{ primary: true, value: "pathless.primary@example.com" },
			],
		});
		expect(retrieved).not.toHaveProperty("externalId");
		expect(persisted.scimUser).toMatchObject({
			id: created.id,
			connectionId: "workforce",
			userId: original.scimUser.userId,
			userName: "pathless.login@example.com",
			primaryEmail: "pathless.primary@example.com",
			displayName: "Pathless Replacement",
			externalId: null,
			externalIdKey: null,
			active: false,
		});
		expect(persisted.user).toMatchObject({
			id: original.user.id,
			email: "pathless.primary@example.com",
			name: "Pathless Replacement",
		});
	});

	it("rejects pathless remove operations with noTarget", async () => {
		const { auth, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "pathless-remove@example.com",
			},
			headers,
		});

		await expect(
			auth.api.patchSCIMUser({
				params: { userId: created.id },
				body: {
					schemas: [PATCH_OP_SCHEMA],
					Operations: [{ op: "remove" }],
				},
				headers,
			}),
		).rejects.toMatchObject({
			statusCode: 400,
			body: expect.objectContaining({ scimType: "noTarget" }),
		});
	});

	it("rejects a read-only path without applying any operation", async () => {
		const { auth, data, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "unchanged.login@example.com",
				name: { formatted: "Unchanged Name" },
				emails: [
					{
						value: "unchanged.primary@example.com",
						primary: true,
					},
				],
				externalId: "directory-user-3",
			},
			headers,
		});
		const resourceBefore = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		const persistedBefore = getPersistedUser(data, created.id);
		const canonicalBefore = {
			userName: persistedBefore.scimUser.userName,
			userNameKey: persistedBefore.scimUser.userNameKey,
			primaryEmail: persistedBefore.scimUser.primaryEmail,
			displayName: persistedBefore.scimUser.displayName,
			externalId: persistedBefore.scimUser.externalId,
			externalIdKey: persistedBefore.scimUser.externalIdKey,
			active: persistedBefore.scimUser.active,
			updatedAt: persistedBefore.scimUser.updatedAt,
		};
		const backingBefore = {
			email: persistedBefore.user.email,
			name: persistedBefore.user.name,
			updatedAt: persistedBefore.user.updatedAt,
		};
		let patchError: unknown;

		try {
			await auth.api.patchSCIMUser({
				params: { userId: created.id },
				body: {
					schemas: [PATCH_OP_SCHEMA],
					Operations: [
						{
							op: "replace",
							path: "userName",
							value: "must-not-persist.login@example.com",
						},
						{
							op: "replace",
							path: "name.formatted",
							value: "Must Not Persist",
						},
						{
							op: "replace",
							path: "id",
							value: "read-only-mutation",
						},
						{
							op: "replace",
							path: 'emails[type eq "work"].value',
							value: "must-not-persist.primary@example.com",
						},
					],
				},
				headers,
			});
		} catch (error) {
			patchError = error;
		}

		const resourceAfter = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		const persistedAfter = getPersistedUser(data, created.id);

		expect(resourceAfter).toEqual(resourceBefore);
		expect({
			userName: persistedAfter.scimUser.userName,
			userNameKey: persistedAfter.scimUser.userNameKey,
			primaryEmail: persistedAfter.scimUser.primaryEmail,
			displayName: persistedAfter.scimUser.displayName,
			externalId: persistedAfter.scimUser.externalId,
			externalIdKey: persistedAfter.scimUser.externalIdKey,
			active: persistedAfter.scimUser.active,
			updatedAt: persistedAfter.scimUser.updatedAt,
		}).toEqual(canonicalBefore);
		expect({
			email: persistedAfter.user.email,
			name: persistedAfter.user.name,
			updatedAt: persistedAfter.user.updatedAt,
		}).toEqual(backingBefore);
		expect(patchError).toMatchObject({
			body: expect.objectContaining({
				schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
				status: "400",
				scimType: "mutability",
			}),
		});
	});
});

describe("SCIM User compatibility with pre-serializedAttributes rows", () => {
	it("serves GET, PUT, and PATCH for a scimUser row persisted before serializedAttributes existed", async () => {
		const { auth, data, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "legacy.login@example.com",
				name: {
					formatted: "Legacy Employee",
					givenName: "Legacy",
					familyName: "Employee",
				},
				emails: [{ value: "legacy.primary@example.com", primary: true }],
			},
			headers,
		});

		function forgetSerializedAttributes() {
			getPersistedUser(data, created.id).scimUser.serializedAttributes =
				undefined;
		}

		forgetSerializedAttributes();
		const retrieved = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		expect(retrieved).toMatchObject({
			userName: "legacy.login@example.com",
			name: {
				formatted: "Legacy Employee",
				givenName: "Legacy",
				familyName: "Employee",
			},
			emails: [{ value: "legacy.primary@example.com", primary: true }],
		});
		expect(
			getPersistedUser(data, created.id).scimUser.serializedAttributes,
		).toBeFalsy();

		forgetSerializedAttributes();
		const replaced = await auth.api.replaceSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "legacy.login@example.com",
				name: {
					formatted: "Legacy Employee Renewed",
					givenName: "Legacy",
					familyName: "Employee",
				},
				emails: [{ value: "legacy.primary@example.com", primary: true }],
			},
			headers,
		});
		expect(replaced.name).toMatchObject({
			formatted: "Legacy Employee Renewed",
		});
		expect(
			getPersistedUser(data, created.id).scimUser.serializedAttributes,
		).toBeTruthy();

		forgetSerializedAttributes();
		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [{ op: "replace", path: "title", value: "Archivist" }],
			},
			headers,
		});
		const patchedResource = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});
		expect(patchedResource.title).toBe("Archivist");
		expect(
			getPersistedUser(data, created.id).scimUser.serializedAttributes,
		).toBeTruthy();
	});

	/**
	 * @see https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups
	 */
	it("accepts an empty Operations array as a no-op PATCH", async () => {
		const { auth, headers } = createTestContext();
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "no-op-patch@example.com",
				displayName: "No Op",
			},
			headers,
		});

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: { schemas: [PATCH_OP_SCHEMA], Operations: [] },
			headers,
		});

		await expect(
			auth.api.getSCIMUser({ params: { userId: created.id }, headers }),
		).resolves.toMatchObject({ displayName: "No Op" });
	});
});
