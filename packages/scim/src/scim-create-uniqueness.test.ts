import type {
	BetterAuthOptions,
	DBAdapter,
	DBTransactionAdapter,
	User,
} from "better-auth";
import { betterAuth } from "better-auth";
import type { MemoryDB } from "better-auth/adapters/memory";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import type { SCIMIdentity } from ".";
import { scim } from ".";
import type { SCIMGroup, SCIMUser } from "./persistence";
import { createScopedKey } from "./resource-key";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const headers = { authorization: "Bearer test-scim-token" };

interface ResourceCreateData extends MemoryDB {
	user: User[];
	scimUser: SCIMUser[];
	scimGroup: SCIMGroup[];
}

type CreateInput = Parameters<DBTransactionAdapter["create"]>[0];

function createData(): ResourceCreateData {
	return {
		user: [],
		session: [],
		verification: [],
		account: [],
		scimConnectionBinding: [],
		scimIdentityTombstone: [],
		scimSubject: [],
		scimUser: [],
		scimGroup: [],
		scimGroupMember: [],
		scimProjectionGrant: [],
	};
}

function createAuth(
	database: BetterAuthOptions["database"],
	identity?: SCIMIdentity,
) {
	return betterAuth({
		baseURL: "http://localhost:3000",
		database,
		plugins: [
			scim({
				...(identity ? { identity } : {}),
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
}

function createConcurrentCommitAdapter(
	data: ResourceCreateData,
	injectConcurrentCommit: (model: string) => void,
) {
	let injected = false;
	return (options: BetterAuthOptions): DBAdapter => {
		const adapter = memoryAdapter(data)(options);
		return {
			...adapter,
			transaction: async <Result>(
				callback: (transaction: DBTransactionAdapter) => Promise<Result>,
			) =>
				adapter.transaction(async (transaction) => {
					const create = async (input: CreateInput): Promise<unknown> => {
						if (
							!injected &&
							(input.model === "scimGroup" || input.model === "scimUser")
						) {
							injected = true;
							injectConcurrentCommit(input.model);
							throw new Error(`Simulated ${input.model} unique constraint`);
						}
						return transaction.create(input);
					};

					return callback({
						...transaction,
						create: create as DBTransactionAdapter["create"],
					});
				}),
		};
	};
}

type UpdateInput = Parameters<DBTransactionAdapter["update"]>[0];

function createConcurrentUpdateAdapter(
	data: ResourceCreateData,
	model: "user" | "scimUser" | "scimGroup",
	injectConcurrentCommit: () => void,
) {
	const race = { armed: false };
	const database = (options: BetterAuthOptions): DBAdapter => {
		const adapter = memoryAdapter(data)(options);
		return {
			...adapter,
			transaction: async <Result>(
				callback: (transaction: DBTransactionAdapter) => Promise<Result>,
			) =>
				adapter.transaction(async (transaction) => {
					const update = async (input: UpdateInput): Promise<unknown> => {
						if (race.armed && input.model === model) {
							race.armed = false;
							injectConcurrentCommit();
							throw new Error(`Simulated ${model} unique constraint`);
						}
						return transaction.update(input);
					};

					return callback({
						...transaction,
						update: update as DBTransactionAdapter["update"],
					});
				}),
		};
	};
	return { database, race };
}

function createCommittedSCIMUser(userName: string): SCIMUser {
	const now = new Date();
	return {
		id: "concurrent-scim-user",
		connectionId: "workforce",
		provisioningDomainId: "workforce",
		userId: "concurrent-user",
		connectionUserKey: createScopedKey([
			"scim-user",
			"workforce",
			"concurrent-user",
		]),
		userName,
		userNameKey: createScopedKey(["scim-user-name", "workforce", userName]),
		primaryEmail: userName,
		workEmailValueIndex: `|${userName}|`,
		emailValueIndex: `|${userName}|`,
		displayName: "Concurrent User",
		formattedName: "Concurrent User",
		serializedEmails: JSON.stringify([{ value: userName, primary: true }]),
		serializedAttributes: JSON.stringify({
			schemas: [USER_SCHEMA],
			name: { formatted: "Concurrent User" },
			emails: [{ value: userName, primary: true }],
		}),
		active: true,
		orderKey: "concurrent-user-order",
		createdAt: now,
		updatedAt: now,
	};
}

function createCommittedSCIMGroup(displayName: string): SCIMGroup {
	const now = new Date();
	return {
		id: "concurrent-group",
		connectionId: "workforce",
		provisioningDomainId: "workforce",
		revision: 0,
		displayName,
		displayNameKey: createScopedKey([
			"scim-group-display-name",
			"workforce",
			displayName.toLowerCase(),
		]),
		orderKey: "concurrent-group-order",
		createdAt: now,
		updatedAt: now,
	};
}

function createBetterAuthUser(id: string, email: string): User {
	const now = new Date();
	return {
		id,
		name: email,
		email,
		emailVerified: false,
		image: null,
		createdAt: now,
		updatedAt: now,
	};
}

const replaceEmailsWith = (email: string) => ({
	schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp" as const],
	Operations: [
		{ op: "replace", path: "emails", value: [{ value: email, primary: true }] },
	],
});

describe("SCIM resource create uniqueness races", () => {
	it("normalizes a concurrent Group displayName commit to SCIM uniqueness", async () => {
		const data = createData();
		const now = new Date();
		const auth = createAuth(
			createConcurrentCommitAdapter(data, (model) => {
				if (model !== "scimGroup") return;
				data.scimGroup.push({
					id: "concurrent-group",
					connectionId: "workforce",
					provisioningDomainId: "workforce",
					revision: 0,
					displayName: "Engineering",
					displayNameKey: createScopedKey([
						"scim-group-display-name",
						"workforce",
						"engineering",
					]),
					orderKey: "concurrent-group-order",
					createdAt: now,
					updatedAt: now,
				});
			}),
		);

		await expect(
			auth.api.createSCIMGroup({
				body: { schemas: [GROUP_SCHEMA], displayName: "Engineering" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				status: "409",
				scimType: "uniqueness",
			}),
		});
	});

	it("normalizes a concurrent User userName commit to SCIM uniqueness", async () => {
		const data = createData();
		const now = new Date();
		const auth = createAuth(
			createConcurrentCommitAdapter(data, (model) => {
				if (model !== "scimUser") return;
				data.user.push({
					id: "concurrent-user",
					name: "Concurrent User",
					email: "ada@example.com",
					emailVerified: false,
					image: null,
					createdAt: now,
					updatedAt: now,
				});
				data.scimUser.push({
					id: "concurrent-scim-user",
					connectionId: "workforce",
					provisioningDomainId: "workforce",
					userId: "concurrent-user",
					connectionUserKey: createScopedKey([
						"scim-user",
						"workforce",
						"concurrent-user",
					]),
					userName: "ada@example.com",
					userNameKey: createScopedKey([
						"scim-user-name",
						"workforce",
						"ada@example.com",
					]),
					primaryEmail: "ada@example.com",
					workEmailValueIndex: "|ada@example.com|",
					emailValueIndex: "|ada@example.com|",
					displayName: "Concurrent User",
					formattedName: "Concurrent User",
					serializedEmails: JSON.stringify([
						{ value: "ada@example.com", primary: true },
					]),
					serializedAttributes: JSON.stringify({
						schemas: [USER_SCHEMA],
						name: { formatted: "Concurrent User" },
						emails: [{ value: "ada@example.com", primary: true }],
					}),
					active: true,
					orderKey: "concurrent-user-order",
					createdAt: now,
					updatedAt: now,
				});
			}),
		);

		await expect(
			auth.api.createSCIMUser({
				body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				status: "409",
				scimType: "uniqueness",
			}),
		});
	});

	it("preserves a create failure when no committed uniqueness conflict exists", async () => {
		const data = createData();
		const auth = createAuth(createConcurrentCommitAdapter(data, () => {}));

		await expect(
			auth.api.createSCIMGroup({
				body: { schemas: [GROUP_SCHEMA], displayName: "Engineering" },
				headers,
			}),
		).rejects.toThrowError("Simulated scimGroup unique constraint");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11111
	 */
	it("normalizes a concurrent userName commit during inactive User reprovisioning", async () => {
		const data = createData();
		const { database, race } = createConcurrentUpdateAdapter(
			data,
			"scimUser",
			() => {
				data.scimUser.push(createCommittedSCIMUser("grace@example.com"));
			},
		);
		const auth = createAuth(database);
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: [USER_SCHEMA],
				userName: "ada@example.com",
				externalId: "directory-subject",
			},
			headers,
		});
		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [{ op: "replace", path: "active", value: false }],
			},
			headers,
		});

		race.armed = true;
		await expect(
			auth.api.createSCIMUser({
				body: {
					schemas: [USER_SCHEMA],
					userName: "grace@example.com",
					externalId: "directory-subject",
				},
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				status: "409",
				scimType: "uniqueness",
			}),
		});
	});

	it("normalizes a concurrent userName commit during User replacement", async () => {
		const data = createData();
		const { database, race } = createConcurrentUpdateAdapter(
			data,
			"scimUser",
			() => {
				data.scimUser.push(createCommittedSCIMUser("grace@example.com"));
			},
		);
		const auth = createAuth(database);
		const created = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
			headers,
		});

		race.armed = true;
		await expect(
			auth.api.replaceSCIMUser({
				params: { userId: created.id },
				body: { schemas: [USER_SCHEMA], userName: "grace@example.com" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				status: "409",
				scimType: "uniqueness",
			}),
		});
	});

	it("preserves a replacement failure when no committed uniqueness conflict exists", async () => {
		const data = createData();
		const { database, race } = createConcurrentUpdateAdapter(
			data,
			"scimUser",
			() => {},
		);
		const auth = createAuth(database);
		const created = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
			headers,
		});

		race.armed = true;
		await expect(
			auth.api.replaceSCIMUser({
				params: { userId: created.id },
				body: { schemas: [USER_SCHEMA], userName: "grace@example.com" },
				headers,
			}),
		).rejects.toThrowError("Simulated scimUser unique constraint");
	});

	it("normalizes a concurrent userName commit during User PATCH", async () => {
		const data = createData();
		const { database, race } = createConcurrentUpdateAdapter(
			data,
			"scimUser",
			() => {
				data.scimUser.push(createCommittedSCIMUser("grace@example.com"));
			},
		);
		const auth = createAuth(database);
		const created = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
			headers,
		});

		race.armed = true;
		await expect(
			auth.api.patchSCIMUser({
				params: { userId: created.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{ op: "replace", path: "userName", value: "grace@example.com" },
					],
				},
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				status: "409",
				scimType: "uniqueness",
			}),
		});
	});

	it("normalizes a concurrent displayName commit during Group replacement", async () => {
		const data = createData();
		const { database, race } = createConcurrentUpdateAdapter(
			data,
			"scimGroup",
			() => {
				data.scimGroup.push(createCommittedSCIMGroup("Finance"));
			},
		);
		const auth = createAuth(database);
		const created = await auth.api.createSCIMGroup({
			body: { schemas: [GROUP_SCHEMA], displayName: "Engineering" },
			headers,
		});

		race.armed = true;
		await expect(
			auth.api.replaceSCIMGroup({
				params: { groupId: created.id },
				body: { schemas: [GROUP_SCHEMA], displayName: "Finance" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				status: "409",
				scimType: "uniqueness",
			}),
		});
	});

	it("normalizes a concurrent displayName commit during Group PATCH", async () => {
		const data = createData();
		const { database, race } = createConcurrentUpdateAdapter(
			data,
			"scimGroup",
			() => {
				data.scimGroup.push(createCommittedSCIMGroup("Finance"));
			},
		);
		const auth = createAuth(database);
		const created = await auth.api.createSCIMGroup({
			body: { schemas: [GROUP_SCHEMA], displayName: "Engineering" },
			headers,
		});

		race.armed = true;
		await expect(
			auth.api.patchSCIMGroup({
				params: { groupId: created.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{ op: "replace", path: "displayName", value: "Finance" },
					],
				},
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				status: "409",
				scimType: "uniqueness",
			}),
		});
	});

	it("preserves a Group PATCH failure when no committed uniqueness conflict exists", async () => {
		const data = createData();
		const { database, race } = createConcurrentUpdateAdapter(
			data,
			"scimGroup",
			() => {},
		);
		const auth = createAuth(database);
		const created = await auth.api.createSCIMGroup({
			body: { schemas: [GROUP_SCHEMA], displayName: "Engineering" },
			headers,
		});

		race.armed = true;
		await expect(
			auth.api.patchSCIMGroup({
				params: { groupId: created.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{ op: "replace", path: "displayName", value: "Finance" },
					],
				},
				headers,
			}),
		).rejects.toThrowError("Simulated scimGroup unique constraint");
	});

	it("normalizes a concurrent managed email commit during User PATCH", async () => {
		const data = createData();
		const { database, race } = createConcurrentUpdateAdapter(
			data,
			"user",
			() => {
				data.user.push(
					createBetterAuthUser("concurrent-user", "grace@example.com"),
				);
			},
		);
		const auth = createAuth(database);
		const created = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
			headers,
		});

		race.armed = true;
		await expect(
			auth.api.patchSCIMUser({
				params: { userId: created.id },
				body: replaceEmailsWith("grace@example.com"),
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				status: "409",
				scimType: "uniqueness",
			}),
		});
	});

	it("preserves a User PATCH failure when the source does not manage the email", async () => {
		const data = createData();
		data.user.push(
			createBetterAuthUser("existing-user", "ada@example.com"),
			createBetterAuthUser("other-user", "grace@example.com"),
		);
		const { database, race } = createConcurrentUpdateAdapter(
			data,
			"scimUser",
			() => {},
		);
		const auth = createAuth(database, {
			resolveUser: () => ({
				action: "link",
				userId: "existing-user",
				profile: "preserve",
			}),
		});
		const created = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
			headers,
		});

		race.armed = true;
		await expect(
			auth.api.patchSCIMUser({
				params: { userId: created.id },
				body: replaceEmailsWith("grace@example.com"),
				headers,
			}),
		).rejects.toThrowError("Simulated scimUser unique constraint");
	});
});
