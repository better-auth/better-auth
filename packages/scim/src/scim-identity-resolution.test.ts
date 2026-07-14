import type {
	BetterAuthOptions,
	SecondaryStorage,
	Session,
	User,
} from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type {
	SCIMConnectionOptions,
	SCIMIdentity,
	SCIMIdentityTombstone,
	SCIMSubject,
	SCIMUser,
} from "./types";

const BASE_URL = "http://localhost:3000";
const CONNECTION_A = {
	id: "workforce-a",
	credentials: [{ type: "bearer", token: "connection-a-token" }],
} as const satisfies SCIMConnectionOptions;
const CONNECTION_B = {
	id: "workforce-b",
	credentials: [{ type: "bearer", token: "connection-b-token" }],
} as const satisfies SCIMConnectionOptions;

function createBackingUser(id = "existing-user"): User {
	const now = new Date();
	return {
		id,
		name: "Original Profile",
		email: "original@example.com",
		emailVerified: true,
		image: null,
		createdAt: now,
		updatedAt: now,
	};
}

function createSession(userId: string): Session {
	const now = new Date();
	return {
		id: "existing-session",
		userId,
		token: "existing-session-token",
		expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
		ipAddress: null,
		userAgent: null,
		createdAt: now,
		updatedAt: now,
	};
}

function createStringSecondaryStorage(
	store: Map<string, string>,
): SecondaryStorage {
	return {
		get: (key) => store.get(key) ?? null,
		getAndDelete(key) {
			const value = store.get(key) ?? null;
			store.delete(key);
			return value;
		},
		increment(key) {
			const next = Number(store.get(key) ?? 0) + 1;
			store.set(key, String(next));
			return next;
		},
		set(key, value) {
			store.set(key, value);
		},
		delete(key) {
			store.delete(key);
		},
	};
}

function createIdentityFixture(
	options: {
		connections?: readonly SCIMConnectionOptions[];
		identity?: SCIMIdentity;
		databaseHooks?: BetterAuthOptions["databaseHooks"];
		secondaryStorage?: SecondaryStorage;
		sessions?: readonly Session[];
		users?: readonly User[];
	} = {},
) {
	const data = {
		user: [...(options.users ?? [])],
		session: [...(options.sessions ?? [])],
		verification: [] as { id: string }[],
		account: [] as { id: string }[],
		scimConnectionBinding: [] as { id: string }[],
		scimIdentityTombstone: [] as SCIMIdentityTombstone[],
		scimSubject: [] as SCIMSubject[],
		scimUser: [] as SCIMUser[],
		scimGroupMember: [] as { id: string }[],
		scimProjectionGrant: [] as { id: string }[],
	};
	const auth = betterAuth({
		baseURL: BASE_URL,
		database: memoryAdapter(data),
		...(options.databaseHooks ? { databaseHooks: options.databaseHooks } : {}),
		...(options.secondaryStorage
			? { secondaryStorage: options.secondaryStorage }
			: {}),
		plugins: [
			scim({
				connections: options.connections ?? [CONNECTION_A],
				...(options.identity ? { identity: options.identity } : {}),
			}),
		],
	});

	return { auth, data };
}

function authorization(token: string) {
	return { authorization: `Bearer ${token}` };
}

function preserveExistingUser(userId: string): SCIMIdentity {
	return {
		resolveUser: () => ({
			action: "link",
			userId,
			profile: "preserve",
		}),
	};
}

describe("SCIM explicit identity resolution", () => {
	it("defaults to creating a new Better Auth User when no resolver is configured", async () => {
		const { auth, data } = createIdentityFixture();
		const resource = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "created@example.com",
			},
			headers: authorization("connection-a-token"),
		});
		await auth.api.patchSCIMUser({
			params: { userId: resource.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{
						op: "replace",
						value: {
							displayName: "Updated Directory Name",
							emails: [
								{
									value: "updated-directory@example.com",
									primary: true,
								},
							],
						},
					},
				],
			},
			headers: authorization("connection-a-token"),
		});

		expect(data.user).toHaveLength(1);
		expect(data.account).toEqual([]);
		expect(data.user[0]).toMatchObject({
			name: "Updated Directory Name",
			email: "updated-directory@example.com",
		});
		expect(data.scimUser).toContainEqual(
			expect.objectContaining({
				id: resource.id,
				userId: data.user[0]?.id,
			}),
		);
	});

	it("links with preserved profile authority without creating or overwriting identity records", async () => {
		const target = createBackingUser();
		const originalProfile = { name: target.name, email: target.email };
		const { auth, data } = createIdentityFixture({
			users: [target],
			identity: preserveExistingUser(target.id),
		});

		const resource = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "directory-ada",
				displayName: "Directory Managed Name",
				emails: [
					{
						value: "directory-managed@example.com",
						primary: true,
					},
				],
			},
			headers: authorization("connection-a-token"),
		});
		await auth.api.patchSCIMUser({
			params: { userId: resource.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{
						op: "replace",
						value: {
							displayName: "Updated Directory Name",
							emails: [
								{
									value: "updated-directory@example.com",
									primary: true,
								},
							],
						},
					},
				],
			},
			headers: authorization("connection-a-token"),
		});

		expect(data.user).toHaveLength(1);
		expect(data.account).toEqual([]);
		expect(data.user[0]).toMatchObject(originalProfile);
		expect(data.scimUser).toContainEqual(
			expect.objectContaining({
				id: resource.id,
				userId: target.id,
				displayName: "Updated Directory Name",
				primaryEmail: "updated-directory@example.com",
			}),
		);
	});

	it("revokes email verification whenever a managing source changes the backing email", async () => {
		const target = createBackingUser();
		const { auth, data } = createIdentityFixture({
			users: [target],
			identity: {
				resolveUser: () => ({
					action: "link",
					userId: target.id,
					profile: "manage",
				}),
			},
		});

		const source = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "managed-directory-user",
				displayName: "Managed Profile",
				emails: [{ value: "managed@example.com", primary: true }],
			},
			headers: authorization("connection-a-token"),
		});

		expect(data.user[0]).toMatchObject({
			id: target.id,
			name: "Managed Profile",
			email: "managed@example.com",
			emailVerified: false,
		});
		expect(data.scimSubject[0]).toMatchObject({ profileSourceId: source.id });

		const linkedUser = data.user[0];
		if (!linkedUser) throw new Error("Expected the linked Better Auth User");
		linkedUser.emailVerified = true;
		await auth.api.replaceSCIMUser({
			params: { userId: source.id },
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "managed-directory-user",
				displayName: "Replaced Managed Profile",
				emails: [{ value: "replaced@example.com", primary: true }],
			},
			headers: authorization("connection-a-token"),
		});
		expect(data.user[0]).toMatchObject({
			email: "replaced@example.com",
			emailVerified: false,
		});

		linkedUser.emailVerified = true;
		await auth.api.patchSCIMUser({
			params: { userId: source.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{
						op: "replace",
						path: "emails",
						value: [{ value: "patched@example.com", primary: true }],
					},
				],
			},
			headers: authorization("connection-a-token"),
		});
		expect(data.user[0]).toMatchObject({
			email: "patched@example.com",
			emailVerified: false,
		});
	});

	it("runs User hooks and refreshes cached sessions only after a successful commit", async () => {
		const target = createBackingUser();
		const session = createSession(target.id);
		const cache = new Map<string, string>();
		cache.set(
			`active-sessions-${target.id}`,
			JSON.stringify([
				{ token: session.token, expiresAt: session.expiresAt.getTime() },
			]),
		);
		cache.set(session.token, JSON.stringify({ session, user: target }));
		let rejectReconciliation = false;
		let beforeUpdates = 0;
		let afterUpdates = 0;
		const { auth, data } = createIdentityFixture({
			users: [target],
			sessions: [session],
			secondaryStorage: createStringSecondaryStorage(cache),
			databaseHooks: {
				user: {
					update: {
						async before(user) {
							beforeUpdates += 1;
							return { data: user };
						},
						async after() {
							afterUpdates += 1;
						},
					},
				},
			},
			identity: {
				resolveUser: () => ({
					action: "link",
					userId: target.id,
					profile: "manage",
				}),
				reconcileUser: () => {
					if (rejectReconciliation) throw new Error("reject reconciliation");
				},
			},
		});

		const source = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "hook-managed-user",
				displayName: "Committed Profile",
				emails: [{ value: "committed@example.com", primary: true }],
			},
			headers: authorization("connection-a-token"),
		});
		const committedCache = JSON.parse(cache.get(session.token) ?? "null") as {
			user: User;
		};
		expect({ beforeUpdates, afterUpdates }).toEqual({
			beforeUpdates: 1,
			afterUpdates: 1,
		});
		expect(committedCache.user).toMatchObject({
			name: "Committed Profile",
			email: "committed@example.com",
		});

		rejectReconciliation = true;
		await expect(
			auth.api.patchSCIMUser({
				params: { userId: source.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{
							op: "replace",
							path: "displayName",
							value: "Rolled Back Profile",
						},
					],
				},
				headers: authorization("connection-a-token"),
			}),
		).rejects.toThrow("SCIM identity reconciliation failed");

		const cacheAfterRollback = JSON.parse(
			cache.get(session.token) ?? "null",
		) as { user: User };
		expect({ beforeUpdates, afterUpdates }).toEqual({
			beforeUpdates: 2,
			afterUpdates: 1,
		});
		expect(cacheAfterRollback.user.name).toBe("Committed Profile");
		expect(data.user[0]?.name).toBe("Committed Profile");
	});

	it("does not report a committed User as failed when cache refresh fails", async () => {
		const target = createBackingUser();
		const session = createSession(target.id);
		const cache = new Map<string, string>();
		cache.set(
			`active-sessions-${target.id}`,
			JSON.stringify([
				{ token: session.token, expiresAt: session.expiresAt.getTime() },
			]),
		);
		cache.set(session.token, JSON.stringify({ session, user: target }));
		const storage = createStringSecondaryStorage(cache);
		storage.set = () => {
			throw new Error("cache unavailable");
		};
		const { auth, data } = createIdentityFixture({
			users: [target],
			sessions: [session],
			secondaryStorage: storage,
			identity: {
				resolveUser: () => ({
					action: "link",
					userId: target.id,
					profile: "manage",
				}),
			},
		});

		const source = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "cache-failure-managed-user",
				displayName: "Committed Despite Cache Failure",
				emails: [{ value: "cache-failure@example.com", primary: true }],
			},
			headers: authorization("connection-a-token"),
		});

		expect(source.id).toBe(data.scimUser[0]?.id);
		expect(data.user[0]).toMatchObject({
			name: "Committed Despite Cache Failure",
			email: "cache-failure@example.com",
		});
	});

	it("rejects a second profile-managing source atomically", async () => {
		const target = createBackingUser();
		const { auth, data } = createIdentityFixture({
			users: [target],
			connections: [CONNECTION_A, CONNECTION_B],
			identity: {
				resolveUser: () => ({
					action: "link",
					userId: target.id,
					profile: "manage",
				}),
			},
		});
		const sourceA = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "source-a@example.com",
				displayName: "Source A Profile",
			},
			headers: authorization("connection-a-token"),
		});

		await expect(
			auth.api.createSCIMUser({
				body: {
					schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
					userName: "source-b@example.com",
					displayName: "Source B Profile",
				},
				headers: authorization("connection-b-token"),
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				statusCode: 409,
				body: expect.objectContaining({
					status: "409",
					scimType: "uniqueness",
				}),
			}),
		);

		expect(data.scimUser).toEqual([
			expect.objectContaining({ id: sourceA.id }),
		]);
		expect(data.scimSubject[0]).toMatchObject({
			profileSourceId: sourceA.id,
		});
		expect(data.user[0]).toMatchObject({ name: "Source A Profile" });
	});

	it("allows two connections to link independent sources to one User", async () => {
		const target = createBackingUser();
		const { auth, data } = createIdentityFixture({
			users: [target],
			connections: [CONNECTION_A, CONNECTION_B],
			identity: preserveExistingUser(target.id),
		});

		const sourceA = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "source-a@example.com",
			},
			headers: authorization("connection-a-token"),
		});
		const sourceB = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "source-b@example.com",
			},
			headers: authorization("connection-b-token"),
		});

		expect(data.user).toHaveLength(1);
		expect(data.account).toEqual([]);
		expect(data.scimSubject).toEqual([
			expect.objectContaining({ userId: target.id }),
		]);
		expect(data.scimUser).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: sourceA.id,
					connectionId: CONNECTION_A.id,
					userId: target.id,
				}),
				expect.objectContaining({
					id: sourceB.id,
					connectionId: CONNECTION_B.id,
					userId: target.id,
				}),
			]),
		);
	});

	it("reprovisions a deleted externalId onto the same Better Auth User", async () => {
		const { auth, data } = createIdentityFixture();
		const first = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "first-name@example.com",
				externalId: "stable-directory-user",
			},
			headers: authorization("connection-a-token"),
		});
		const originalSource = data.scimUser.find(
			(source) => source.id === first.id,
		);
		if (!originalSource) throw new Error("Expected the original SCIM source");

		await auth.api.deleteSCIMUser({
			params: { userId: first.id },
			headers: authorization("connection-a-token"),
		});
		expect(data.scimIdentityTombstone).toEqual([
			expect.objectContaining({
				connectionId: CONNECTION_A.id,
				externalId: "stable-directory-user",
				userId: originalSource.userId,
				profile: "manage",
			}),
		]);

		const recreated = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "renamed@example.com",
				externalId: "stable-directory-user",
			},
			headers: authorization("connection-a-token"),
		});
		const recreatedSource = data.scimUser.find(
			(source) => source.id === recreated.id,
		);

		expect(data.user).toHaveLength(1);
		expect(recreatedSource?.userId).toBe(originalSource.userId);
		expect(data.scimIdentityTombstone).toEqual([]);
	});

	it("revokes sessions only when the final linked source becomes inactive", async () => {
		const target = createBackingUser();
		const session = createSession(target.id);
		const { auth, data } = createIdentityFixture({
			users: [target],
			sessions: [session],
			connections: [CONNECTION_A, CONNECTION_B],
			identity: preserveExistingUser(target.id),
		});
		const sourceA = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "source-a@example.com",
			},
			headers: authorization("connection-a-token"),
		});
		const sourceB = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "source-b@example.com",
			},
			headers: authorization("connection-b-token"),
		});

		await auth.api.patchSCIMUser({
			params: { userId: sourceA.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [{ op: "replace", path: "active", value: false }],
			},
			headers: authorization("connection-a-token"),
		});
		const sessionsAfterFirstDeactivation = [...data.session];

		await auth.api.patchSCIMUser({
			params: { userId: sourceB.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [{ op: "replace", path: "active", value: false }],
			},
			headers: authorization("connection-b-token"),
		});

		expect(sessionsAfterFirstDeactivation).toEqual([session]);
		expect(data.session).toEqual([]);
	});

	it("rejects a second source for the same User in one connection", async () => {
		const target = createBackingUser();
		const { auth, data } = createIdentityFixture({
			users: [target],
			identity: preserveExistingUser(target.id),
		});
		await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "first-source@example.com",
			},
			headers: authorization("connection-a-token"),
		});

		await expect(
			auth.api.createSCIMUser({
				body: {
					schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
					userName: "second-source@example.com",
				},
				headers: authorization("connection-a-token"),
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				statusCode: 409,
				body: expect.objectContaining({
					status: "409",
					scimType: "uniqueness",
				}),
			}),
		);
		expect(data.user).toHaveLength(1);
		expect(data.account).toEqual([]);
		expect(data.scimUser).toHaveLength(1);
	});

	it("rejects a missing link target without persisting partial identity state", async () => {
		const { auth, data } = createIdentityFixture({
			identity: preserveExistingUser("missing-user"),
		});
		const response = await auth.handler(
			new Request(`${BASE_URL}/api/auth/scim/v2/Users`, {
				method: "POST",
				headers: {
					authorization: "Bearer connection-a-token",
					"content-type": "application/scim+json",
				},
				body: JSON.stringify({
					schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
					userName: "missing-target@example.com",
				}),
			}),
		);

		expect(response.ok).toBe(false);
		expect({
			users: data.user.length,
			accounts: data.account.length,
			subjects: data.scimSubject.length,
			sources: data.scimUser.length,
		}).toEqual({
			users: 0,
			accounts: 0,
			subjects: 0,
			sources: 0,
		});
	});

	it("rolls back profile, lifecycle, and session changes when reconciliation fails", async () => {
		const target = createBackingUser();
		const session = createSession(target.id);
		let rejectReconciliation = false;
		const { auth, data } = createIdentityFixture({
			users: [target],
			sessions: [session],
			identity: {
				resolveUser: () => ({
					action: "link",
					userId: target.id,
					profile: "manage",
				}),
				reconcileUser: () => {
					if (rejectReconciliation) {
						throw new Error("Application lifecycle reconciliation failed");
					}
				},
			},
		});
		const source = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "managed-source@example.com",
				displayName: "Managed Before Failure",
			},
			headers: authorization("connection-a-token"),
		});
		const revisionBeforeFailure = data.scimSubject[0]?.revision;
		rejectReconciliation = true;

		await expect(
			auth.api.patchSCIMUser({
				params: { userId: source.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{
							op: "replace",
							value: {
								active: false,
								displayName: "Managed After Failure",
							},
						},
					],
				},
				headers: authorization("connection-a-token"),
			}),
		).rejects.toThrow("SCIM identity reconciliation failed");

		expect(data.scimUser[0]).toMatchObject({
			id: source.id,
			active: true,
			displayName: "Managed Before Failure",
		});
		expect(data.user[0]).toMatchObject({ name: "Managed Before Failure" });
		expect(data.session).toEqual([session]);
		expect(data.scimSubject[0]?.revision).toBe(revisionBeforeFailure);
	});
});
