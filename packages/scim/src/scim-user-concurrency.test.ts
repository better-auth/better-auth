import type {
	BetterAuthOptions,
	DBAdapter,
	DBTransactionAdapter,
	User,
	Where,
} from "better-auth";
import { betterAuth } from "better-auth";
import type { MemoryDB } from "better-auth/adapters/memory";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type {
	SCIMGroup,
	SCIMGroupMember,
	SCIMIdentityTombstone,
	SCIMSubject,
	SCIMUser,
} from "./types";

const BASE_URL = "http://localhost:3000";
const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const headers = { authorization: "Bearer test-scim-token" };

interface UserDeletionData extends MemoryDB {
	user: User[];
	scimIdentityTombstone: SCIMIdentityTombstone[];
	scimSubject: SCIMSubject[];
	scimUser: SCIMUser[];
	scimGroup: SCIMGroup[];
	scimGroupMember: SCIMGroupMember[];
}

interface IncrementOneInput {
	model: string;
	where: Where[];
	increment: Record<string, number>;
	set?: Record<string, unknown>;
}

type CreateInput = Parameters<DBTransactionAdapter["create"]>[0];

function createData(): UserDeletionData {
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

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function findWhereValue(where: readonly Where[], field: string): unknown {
	return where.find((clause) => clause.field === field)?.value;
}

function createAuth(database: BetterAuthOptions["database"]) {
	return betterAuth({
		baseURL: BASE_URL,
		database,
		plugins: [
			scim({
				connections: [
					{
						id: "workforce",
						credentials: [{ type: "bearer", token: "test-scim-token" }],
					},
				],
			}),
		],
	});
}

function createSourceUpdateRaceAdapter(data: UserDeletionData) {
	const groupLockReached = createDeferred();
	const releaseGroupLock = createDeferred();
	let enabled = false;
	let groupLockPaused = false;
	let patchCommitted = false;

	return {
		database: (options: BetterAuthOptions): DBAdapter => {
			const adapter = memoryAdapter(data)(options);
			return {
				...adapter,
				transaction: async <Result>(
					callback: (transaction: DBTransactionAdapter) => Promise<Result>,
				) =>
					adapter.transaction(async (transaction) => {
						const heldSubjectIds = new Set<string>();
						const incrementOne: DBTransactionAdapter["incrementOne"] = async <
							Row,
						>(
							input: IncrementOneInput,
						) => {
							if (enabled && !groupLockPaused && input.model === "scimGroup") {
								groupLockPaused = true;
								groupLockReached.resolve();
								await releaseGroupLock.promise;
							}
							if (input.model === "scimSubject") {
								const subjectId = findWhereValue(input.where, "id");
								const expectedRevision = findWhereValue(
									input.where,
									"revision",
								);
								if (
									typeof subjectId === "string" &&
									!heldSubjectIds.has(subjectId)
								) {
									if (enabled && patchCommitted) {
										const liveSubject = data.scimSubject.find(
											(subject) => subject.id === subjectId,
										);
										if (
											!liveSubject ||
											liveSubject.revision !== expectedRevision
										) {
											return null;
										}
									}
									heldSubjectIds.add(subjectId);
								}
							}
							return transaction.incrementOne<Row>(input);
						};

						return callback({ ...transaction, incrementOne });
					}),
			};
		},
		enable: () => {
			enabled = true;
		},
		groupLockReached: groupLockReached.promise,
		markPatchCommitted: () => {
			patchCommitted = true;
		},
		releaseGroupLock: releaseGroupLock.resolve,
	};
}

function createMembershipRaceAdapter(data: UserDeletionData) {
	let race:
		| {
				concurrentGroupId: string;
				scimUserId: string;
		  }
		| undefined;
	let membershipInjected = false;
	const groupLockOrderByAttempt: string[][] = [];

	return {
		database: (options: BetterAuthOptions): DBAdapter => {
			const adapter = memoryAdapter(data)(options);
			return {
				...adapter,
				transaction: async <Result>(
					callback: (transaction: DBTransactionAdapter) => Promise<Result>,
				) => {
					if (!race) return adapter.transaction(callback);
					const activeRace = race;
					const groupLockOrder: string[] = [];
					groupLockOrderByAttempt.push(groupLockOrder);

					return adapter.transaction(async (transaction) => {
						const heldSubjectIds = new Set<string>();
						const incrementOne: DBTransactionAdapter["incrementOne"] = async <
							Row,
						>(
							input: IncrementOneInput,
						) => {
							if (input.model === "scimGroup") {
								const groupId = findWhereValue(input.where, "id");
								if (typeof groupId === "string") groupLockOrder.push(groupId);
							}
							if (input.model === "scimSubject") {
								const subjectId = findWhereValue(input.where, "id");
								if (
									typeof subjectId === "string" &&
									!heldSubjectIds.has(subjectId)
								) {
									if (!membershipInjected) {
										membershipInjected = true;
										const source = data.scimUser.find(
											(candidate) => candidate.id === activeRace.scimUserId,
										);
										const liveSubject = data.scimSubject.find(
											(candidate) => candidate.id === subjectId,
										);
										const liveGroup = data.scimGroup.find(
											(candidate) =>
												candidate.id === activeRace.concurrentGroupId,
										);
										if (!source || !liveSubject || !liveGroup) {
											throw new Error("Expected live SCIM race state");
										}
										const committedAt = new Date();
										data.scimGroupMember.push({
											id: "concurrent-membership",
											connectionId: "workforce",
											groupId: liveGroup.id,
											scimUserId: source.id,
											membershipKey: "concurrent-membership-key",
											createdAt: committedAt,
										});
										liveGroup.revision++;
										liveGroup.updatedAt = committedAt;
										liveSubject.revision++;
										liveSubject.updatedAt = committedAt;
										return null;
									}
									heldSubjectIds.add(subjectId);
								}
							}
							return transaction.incrementOne<Row>(input);
						};

						return callback({ ...transaction, incrementOne });
					});
				},
			};
		},
		groupLockOrderByAttempt,
		startRace(input: { concurrentGroupId: string; scimUserId: string }) {
			race = input;
		},
	};
}

function createPatchRaceAdapter(data: UserDeletionData) {
	const subjectLockReached = createDeferred();
	const releaseSubjectLock = createDeferred();
	let enabled = false;
	let subjectLockPaused = false;
	let secondPatchCommitted = false;

	return {
		database: (options: BetterAuthOptions): DBAdapter => {
			const adapter = memoryAdapter(data)(options);
			return {
				...adapter,
				transaction: async <Result>(
					callback: (transaction: DBTransactionAdapter) => Promise<Result>,
				) =>
					adapter.transaction(async (transaction) => {
						const heldSubjectIds = new Set<string>();
						const incrementOne: DBTransactionAdapter["incrementOne"] = async <
							Row,
						>(
							input: IncrementOneInput,
						) => {
							if (input.model !== "scimSubject") {
								return transaction.incrementOne<Row>(input);
							}
							const subjectId = findWhereValue(input.where, "id");
							const expectedRevision = findWhereValue(input.where, "revision");
							if (
								typeof subjectId !== "string" ||
								heldSubjectIds.has(subjectId)
							) {
								return transaction.incrementOne<Row>(input);
							}
							if (enabled && !subjectLockPaused) {
								subjectLockPaused = true;
								subjectLockReached.resolve();
								await releaseSubjectLock.promise;
							}
							if (enabled && secondPatchCommitted) {
								const liveSubject = data.scimSubject.find(
									(subject) => subject.id === subjectId,
								);
								if (!liveSubject || liveSubject.revision !== expectedRevision) {
									return null;
								}
							}
							heldSubjectIds.add(subjectId);
							return transaction.incrementOne<Row>(input);
						};

						return callback({ ...transaction, incrementOne });
					}),
			};
		},
		enable: () => {
			enabled = true;
		},
		markSecondPatchCommitted: () => {
			secondPatchCommitted = true;
		},
		releaseSubjectLock: releaseSubjectLock.resolve,
		subjectLockReached: subjectLockReached.promise,
	};
}

function createSubjectCreationRaceAdapter(data: UserDeletionData) {
	const subjectCreateReached = createDeferred();
	const releaseSubjectCreate = createDeferred();
	let subjectCreatePaused = false;

	return {
		database: (options: BetterAuthOptions): DBAdapter => {
			const adapter = memoryAdapter(data)(options);
			return {
				...adapter,
				transaction: async <Result>(
					callback: (transaction: DBTransactionAdapter) => Promise<Result>,
				) =>
					adapter.transaction(async (transaction) => {
						const create = async (input: CreateInput): Promise<unknown> => {
							if (input.model !== "scimSubject") {
								return transaction.create(input);
							}
							if (!subjectCreatePaused) {
								subjectCreatePaused = true;
								subjectCreateReached.resolve();
								await releaseSubjectCreate.promise;
							}
							if (data.scimSubject.length > 0) {
								throw new Error("Simulated unique scimSubject userId conflict");
							}
							return transaction.create(input);
						};

						return callback({
							...transaction,
							create: create as DBTransactionAdapter["create"],
						});
					}),
			};
		},
		releaseSubjectCreate: releaseSubjectCreate.resolve,
		subjectCreateReached: subjectCreateReached.promise,
	};
}

describe("SCIM User concurrency", () => {
	it("retries concurrent first-time links to the same Better Auth User", async () => {
		const data = createData();
		const existingUser: User = {
			id: "existing-user",
			name: "Existing User",
			email: "existing@example.com",
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		data.user.push(existingUser);
		const race = createSubjectCreationRaceAdapter(data);
		const auth = betterAuth({
			baseURL: BASE_URL,
			database: race.database,
			plugins: [
				scim({
					connections: [
						{
							id: "workforce-a",
							credentials: [{ type: "bearer", token: "connection-a-token" }],
						},
						{
							id: "workforce-b",
							credentials: [{ type: "bearer", token: "connection-b-token" }],
						},
					],
					identity: {
						resolveUser: () => ({
							action: "link",
							userId: existingUser.id,
							profile: "preserve",
						}),
					},
				}),
			],
		});
		const firstLink = auth.api.createSCIMUser({
			body: {
				schemas: [USER_SCHEMA],
				userName: "first-link@example.com",
				externalId: "first-link",
			},
			headers: { authorization: "Bearer connection-a-token" },
		});
		await race.subjectCreateReached;
		try {
			await auth.api.createSCIMUser({
				body: {
					schemas: [USER_SCHEMA],
					userName: "second-link@example.com",
					externalId: "second-link",
				},
				headers: { authorization: "Bearer connection-b-token" },
			});
		} finally {
			race.releaseSubjectCreate();
		}
		await firstLink;

		expect(data.scimSubject).toHaveLength(1);
		expect(data.scimUser).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					connectionId: "workforce-a",
					userId: existingUser.id,
				}),
				expect.objectContaining({
					connectionId: "workforce-b",
					userId: existingUser.id,
				}),
			]),
		);
	});

	it("retries PATCH against the source committed before its subject lock", async () => {
		const data = createData();
		const race = createPatchRaceAdapter(data);
		const auth = createAuth(race.database);
		const user = await auth.api.createSCIMUser({
			body: {
				schemas: [USER_SCHEMA],
				userName: "patch-race@example.com",
				displayName: "Initial display name",
				active: true,
			},
			headers,
		});
		race.enable();

		const displayNamePatch = auth.api.patchSCIMUser({
			params: { userId: user.id },
			body: {
				schemas: [PATCH_SCHEMA],
				Operations: [
					{
						op: "replace",
						path: "displayName",
						value: "Committed display name",
					},
				],
			},
			headers,
		});
		await race.subjectLockReached;
		try {
			await auth.api.patchSCIMUser({
				params: { userId: user.id },
				body: {
					schemas: [PATCH_SCHEMA],
					Operations: [{ op: "replace", path: "active", value: false }],
				},
				headers,
			});
			race.markSecondPatchCommitted();
		} finally {
			race.releaseSubjectLock();
		}
		await displayNamePatch;

		const current = await auth.api.getSCIMUser({
			params: { userId: user.id },
			headers,
		});
		expect(current).toMatchObject({
			active: false,
			displayName: "Committed display name",
		});
	});

	it("tombstones the source state committed before the subject lock", async () => {
		const data = createData();
		const race = createSourceUpdateRaceAdapter(data);
		const auth = createAuth(race.database);
		const user = await auth.api.createSCIMUser({
			body: {
				schemas: [USER_SCHEMA],
				userName: "source-race@example.com",
				externalId: "old-directory-id",
			},
			headers,
		});
		await auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "source-race",
				members: [{ value: user.id }],
			},
			headers,
		});
		race.enable();

		const deletion = auth.api.deleteSCIMUser({
			params: { userId: user.id },
			headers,
		});
		await race.groupLockReached;
		try {
			await auth.api.patchSCIMUser({
				params: { userId: user.id },
				body: {
					schemas: [PATCH_SCHEMA],
					Operations: [
						{
							op: "replace",
							path: "externalId",
							value: "new-directory-id",
						},
					],
				},
				headers,
			});
			race.markPatchCommitted();
		} finally {
			race.releaseGroupLock();
		}
		await deletion;

		expect(data.scimIdentityTombstone).toEqual([
			expect.objectContaining({
				externalId: "new-directory-id",
				userId: data.user[0]?.id,
			}),
		]);
	});

	it("retries a new membership and updates every Group in sorted lock order", async () => {
		const data = createData();
		const race = createMembershipRaceAdapter(data);
		const auth = createAuth(race.database);
		const user = await auth.api.createSCIMUser({
			body: {
				schemas: [USER_SCHEMA],
				userName: "membership-race@example.com",
			},
			headers,
		});
		const initialGroup = await auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "initial-membership",
				members: [{ value: user.id }],
			},
			headers,
		});
		const concurrentGroup = await auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "concurrent-membership",
			},
			headers,
		});
		for (const group of data.scimGroup) group.updatedAt = new Date(0);
		race.startRace({
			concurrentGroupId: concurrentGroup.id,
			scimUserId: user.id,
		});

		await auth.api.deleteSCIMUser({
			params: { userId: user.id },
			headers,
		});

		expect(race.groupLockOrderByAttempt).toEqual([
			[initialGroup.id],
			[initialGroup.id, concurrentGroup.id].sort(),
		]);
		expect(data.scimGroupMember).toEqual([]);
		expect(data.scimGroup).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: initialGroup.id,
					revision: 1,
				}),
				expect.objectContaining({
					id: concurrentGroup.id,
					revision: 2,
				}),
			]),
		);
		expect(data.scimGroup.every((group) => group.updatedAt.getTime() > 0)).toBe(
			true,
		);
	});
});
