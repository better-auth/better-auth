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
	SCIMGroupMember,
	SCIMProjectedUserState,
	SCIMSubject,
	SCIMUser,
} from "./types";

const BASE_URL = "http://localhost:3000";
const PATCH_OP_SCHEMA =
	"urn:ietf:params:scim:api:messages:2.0:PatchOp" as const;

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

interface IncrementOneInput {
	model: string;
	where: Where[];
	increment: Record<string, number>;
	set?: Record<string, unknown>;
}

function createSubjectLockingMemoryAdapter(
	data: MemoryDB & { scimSubject: SCIMSubject[] },
	onSubjectLockWait: () => void,
) {
	const subjectLockTails = new Map<string, Promise<void>>();

	return (options: BetterAuthOptions): DBAdapter => {
		const adapter = memoryAdapter(data)(options);
		return {
			...adapter,
			transaction: async <Result>(
				callback: (transaction: DBTransactionAdapter) => Promise<Result>,
			) => {
				const releases: Array<() => void> = [];
				const heldSubjectIds = new Set<string>();
				try {
					return await adapter.transaction(async (transaction) => {
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
								typeof expectedRevision !== "number" ||
								heldSubjectIds.has(subjectId)
							) {
								return transaction.incrementOne<Row>(input);
							}

							const previousTail = subjectLockTails.get(subjectId);
							let release!: () => void;
							const currentTail = new Promise<void>((resolve) => {
								release = resolve;
							});
							subjectLockTails.set(subjectId, currentTail);
							if (previousTail) onSubjectLockWait();
							await previousTail;
							heldSubjectIds.add(subjectId);
							releases.push(() => {
								release();
								if (subjectLockTails.get(subjectId) === currentTail) {
									subjectLockTails.delete(subjectId);
								}
							});

							const liveSubject = data.scimSubject.find(
								(subject) => subject.id === subjectId,
							);
							if (!liveSubject) {
								return transaction.incrementOne<Row>(input);
							}
							if (liveSubject.revision !== expectedRevision) return null;
							return transaction.incrementOne<Row>(input);
						};

						return callback({ ...transaction, incrementOne });
					});
				} finally {
					for (const release of releases.reverse()) release();
				}
			},
		};
	};
}

function createMutationOrderMemoryAdapter(
	data: MemoryDB & { scimSubject: SCIMSubject[] },
	operations: string[],
) {
	return (options: BetterAuthOptions): DBAdapter => {
		const adapter = memoryAdapter(data)(options);
		return {
			...adapter,
			transaction: async <Result>(
				callback: (transaction: DBTransactionAdapter) => Promise<Result>,
			) =>
				adapter.transaction(async (transaction) => {
					const incrementOne: DBTransactionAdapter["incrementOne"] = async <
						Row,
					>(
						input: IncrementOneInput,
					) => {
						if (input.model === "scimGroup") {
							operations.push("group-lock");
						} else if (input.model === "scimSubject") {
							operations.push("subject-lock");
						}
						return transaction.incrementOne<Row>(input);
					};
					const deleteMany: DBTransactionAdapter["deleteMany"] = async (
						input,
					) => {
						if (input.model === "scimGroupMember") {
							operations.push("membership-write");
						}
						return transaction.deleteMany(input);
					};

					return callback({ ...transaction, deleteMany, incrementOne });
				}),
		};
	};
}

describe("SCIM incremental Group PATCH", () => {
	it("returns 204 and reconciles only the membership delta", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUser[],
			scimGroup: [] as { id: string; updatedAt: Date }[],
			scimGroupMember: [] as SCIMGroupMember[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const reconciledUserIds: string[] = [];
		const auth = betterAuth({
			baseURL: BASE_URL,
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [{ type: "bearer", token: "test-scim-token" }],
						},
					],
					projection: {
						reconcileUser: ({ userId }) => {
							reconciledUserIds.push(userId);
						},
					},
				}),
			],
		});
		const headers = { authorization: "Bearer test-scim-token" };
		const first = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "first@example.com",
			},
			headers,
		});
		const second = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "second@example.com",
			},
			headers,
		});
		const added = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "added@example.com",
			},
			headers,
		});
		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Engineering",
				members: [{ value: first.id }, { value: second.id }],
			},
			headers,
		});
		reconciledUserIds.length = 0;

		const response = await auth.handler(
			new Request(`${BASE_URL}/api/auth/scim/v2/Groups/${group.id}`, {
				method: "PATCH",
				headers: {
					authorization: "Bearer test-scim-token",
					"content-type": "application/scim+json",
				},
				body: JSON.stringify({
					schemas: [PATCH_OP_SCHEMA],
					Operations: [
						{
							op: "add",
							path: "members",
							value: [{ value: added.id }],
						},
					],
				}),
			}),
		);
		const addedSource = data.scimUser.find((source) => source.id === added.id);
		if (!addedSource) throw new Error("Expected the added SCIM User");

		expect(response.status).toBe(204);
		expect(response.headers.get("location")).toContain(`/Groups/${group.id}`);
		expect(await response.text()).toBe("");
		expect(reconciledUserIds).toEqual([addedSource.userId]);
		expect(
			data.scimGroupMember.filter(
				(membership) => membership.groupId === group.id,
			),
		).toHaveLength(3);

		const persistedGroup = data.scimGroup.find(
			(candidate) => candidate.id === group.id,
		);
		if (!persistedGroup) throw new Error("Expected the persisted SCIM Group");
		const updatedAtAfterChange = persistedGroup.updatedAt;
		reconciledUserIds.length = 0;
		await auth.api.patchSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "add",
						path: "members",
						value: [{ value: added.id }],
					},
				],
			},
			headers,
		});

		expect(
			data.scimGroup.find((candidate) => candidate.id === group.id)?.updatedAt,
		).toEqual(updatedAtAfterChange);
		expect(reconciledUserIds).toEqual([]);
	});

	it("serializes complete role projection for concurrent Group membership changes", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as SCIMSubject[],
			scimUser: [] as SCIMUser[],
			scimGroup: [] as { id: string }[],
			scimGroupMember: [] as SCIMGroupMember[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const firstCallbackStarted = createDeferred();
		const releaseFirstCallback = createDeferred();
		const secondCallbackStarted = createDeferred();
		const secondSubjectLockWaited = createDeferred();
		let concurrentPhase = false;
		let activeCallbacks = 0;
		let maximumActiveCallbacks = 0;
		let callbackCount = 0;
		let projectedRoles: string[] = [];
		const auth = betterAuth({
			baseURL: BASE_URL,
			database: createSubjectLockingMemoryAdapter(data, () => {
				if (concurrentPhase) secondSubjectLockWaited.resolve();
			}),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [{ type: "bearer", token: "test-scim-token" }],
						},
					],
					projection: {
						roles: {
							map: ({ source }) => [`role:${source.displayName}`],
							exists: () => true,
						},
						async reconcileUser(state: SCIMProjectedUserState) {
							if (!concurrentPhase) return;
							activeCallbacks++;
							maximumActiveCallbacks = Math.max(
								maximumActiveCallbacks,
								activeCallbacks,
							);
							callbackCount++;
							try {
								if (callbackCount === 1) {
									firstCallbackStarted.resolve();
									await releaseFirstCallback.promise;
								} else {
									secondCallbackStarted.resolve();
								}
								projectedRoles = state.grants.map((grant) => grant.role).sort();
							} finally {
								activeCallbacks--;
							}
						},
					},
				}),
			],
		});
		const headers = { authorization: "Bearer test-scim-token" };
		const user = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "concurrent@example.com",
			},
			headers,
		});
		const firstGroup = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "engineering",
			},
			headers,
		});
		const secondGroup = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "finance",
			},
			headers,
		});
		concurrentPhase = true;

		const addUser = (groupId: string) =>
			auth.api.patchSCIMGroup({
				params: { groupId },
				body: {
					schemas: [PATCH_OP_SCHEMA],
					Operations: [
						{
							op: "add" as const,
							path: "members",
							value: [{ value: user.id }],
						},
					],
				},
				headers,
			});
		const firstPatch = addUser(firstGroup.id);
		await firstCallbackStarted.promise;
		const secondPatch = addUser(secondGroup.id);
		await Promise.race([
			secondCallbackStarted.promise,
			secondSubjectLockWaited.promise,
		]);
		releaseFirstCallback.resolve();
		await Promise.all([firstPatch, secondPatch]);

		expect(maximumActiveCallbacks).toBe(1);
		expect(projectedRoles).toEqual(["role:engineering", "role:finance"]);
	});

	it("acquires the Group and affected subjects before changing membership rows", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as SCIMSubject[],
			scimUser: [] as SCIMUser[],
			scimGroup: [] as { id: string }[],
			scimGroupMember: [] as SCIMGroupMember[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const operations: string[] = [];
		const auth = betterAuth({
			baseURL: BASE_URL,
			database: createMutationOrderMemoryAdapter(data, operations),
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
		const headers = { authorization: "Bearer test-scim-token" };
		const user = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "lock-order@example.com",
			},
			headers,
		});
		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "lock-order",
				members: [{ value: user.id }],
			},
			headers,
		});
		operations.length = 0;

		await auth.api.patchSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: [PATCH_OP_SCHEMA],
				Operations: [
					{
						op: "remove",
						path: "members",
						value: [{ value: user.id }],
					},
				],
			},
			headers,
		});

		expect(operations).toEqual(
			expect.arrayContaining([
				"group-lock",
				"subject-lock",
				"membership-write",
			]),
		);
		expect(operations.indexOf("group-lock")).toBeLessThan(
			operations.indexOf("subject-lock"),
		);
		expect(operations.indexOf("subject-lock")).toBeLessThan(
			operations.indexOf("membership-write"),
		);
	});

	it("locks affected Groups before the subject when deleting a User", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as SCIMSubject[],
			scimUser: [] as SCIMUser[],
			scimGroup: [] as { id: string }[],
			scimGroupMember: [] as SCIMGroupMember[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const operations: string[] = [];
		const auth = betterAuth({
			baseURL: BASE_URL,
			database: createMutationOrderMemoryAdapter(data, operations),
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
		const headers = { authorization: "Bearer test-scim-token" };
		const user = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "delete-lock-order@example.com",
			},
			headers,
		});
		await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "delete-lock-order",
				members: [{ value: user.id }],
			},
			headers,
		});
		operations.length = 0;

		await auth.api.deleteSCIMUser({
			params: { userId: user.id },
			headers,
		});

		expect(operations).toEqual(
			expect.arrayContaining([
				"group-lock",
				"subject-lock",
				"membership-write",
			]),
		);
		expect(operations.indexOf("group-lock")).toBeLessThan(
			operations.indexOf("subject-lock"),
		);
		expect(operations.indexOf("subject-lock")).toBeLessThan(
			operations.indexOf("membership-write"),
		);
	});

	it("rolls back internal adapter writes when Group projection fails", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as SCIMSubject[],
			scimUser: [] as SCIMUser[],
			scimGroup: [] as { id: string }[],
			scimGroupMember: [] as SCIMGroupMember[],
			scimProjectionGrant: [] as { id: string }[],
		};
		let rejectProjection = false;
		const auth = betterAuth({
			baseURL: BASE_URL,
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [{ type: "bearer", token: "test-scim-token" }],
						},
					],
					projection: {
						async reconcileUser(state, context) {
							if (!rejectProjection) return;
							await context.database.update({
								model: "user",
								where: [{ field: "id", value: state.userId }],
								update: { name: "Projection write that must roll back" },
							});
							throw new Error("Application projection failed");
						},
					},
				}),
			],
		});
		const headers = { authorization: "Bearer test-scim-token" };
		const user = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "rollback@example.com",
				displayName: "Before projection failure",
			},
			headers,
		});
		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "rollback-group",
			},
			headers,
		});
		const source = data.scimUser.find((candidate) => candidate.id === user.id);
		if (!source) throw new Error("Expected the provisioned SCIM User source");
		rejectProjection = true;

		await expect(
			auth.api.patchSCIMGroup({
				params: { groupId: group.id },
				body: {
					schemas: [PATCH_OP_SCHEMA],
					Operations: [
						{
							op: "add",
							path: "members",
							value: [{ value: user.id }],
						},
					],
				},
				headers,
			}),
		).rejects.toThrow("SCIM projection reconciliation failed");

		expect(
			data.user.find((candidate) => candidate.id === source.userId)?.name,
		).toBe("Before projection failure");
		expect(
			data.scimGroupMember.some(
				(membership) =>
					membership.groupId === group.id && membership.scimUserId === user.id,
			),
		).toBe(false);
	});
});
