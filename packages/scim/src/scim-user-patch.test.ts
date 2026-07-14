import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMUser } from "./persistence";

const PATCH_OP_SCHEMA =
	"urn:ietf:params:scim:api:messages:2.0:PatchOp" as const;

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
			}),
		],
	});

	return {
		auth,
		data,
		headers: { authorization: "Bearer test-scim-token" },
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

	it("adds a missing work email and treats a missing filtered removal as a no-op", async () => {
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
		const updatedAtAfterRemoval = getPersistedUser(data, created.id).scimUser
			.updatedAt;
		await expect(
			auth.api.patchSCIMUser({
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
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				statusCode: 400,
				body: expect.objectContaining({ scimType: "noTarget" }),
			}),
		);
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
					{
						value: "other-work@example.com",
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
								{ value: "duplicate@example.com", type: "work" },
								{ value: "duplicate@example.com", type: "work" },
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
		expect(persistedAfter.scimUser.serializedEmails).toBe(
			persistedBefore.scimUser.serializedEmails,
		);
		expect(persistedAfter.user.email).toBe(persistedBefore.user.email);
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
