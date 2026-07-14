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
import { SCIM_MAX_GROUP_MEMBERS } from "./group-schemas";
import type { SCIMSubject } from "./types";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

interface GroupRow {
	id: string;
	displayName: string;
	revision: number;
	updatedAt: Date;
}

interface GroupMemberRow {
	id: string;
	connectionId: string;
	groupId: string;
	scimUserId: string;
	membershipKey: string;
	createdAt: Date;
}

interface SCIMUserRow {
	id: string;
	connectionId?: string;
	displayName?: string;
}

interface IncrementOneInput {
	model: string;
	where: Where[];
	increment: Record<string, number>;
	set?: Record<string, unknown>;
}

function findWhereValue(where: readonly Where[], field: string): unknown {
	return where.find((clause) => clause.field === field)?.value;
}

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function createCardinalityRaceAdapter(
	data: MemoryDB & { scimGroup: GroupRow[] },
) {
	const groupLockTails = new Map<string, Promise<void>>();
	const cardinalityReadsMayContinue = createDeferred();
	let cardinalityReadCount = 0;

	return (options: BetterAuthOptions): DBAdapter => {
		const adapter = memoryAdapter(data)(options);
		return {
			...adapter,
			transaction: async <Result>(
				callback: (transaction: DBTransactionAdapter) => Promise<Result>,
			) => {
				const releases: Array<() => void> = [];
				const heldGroupIds = new Set<string>();
				try {
					return await adapter.transaction(async (transaction) => {
						const incrementOne: DBTransactionAdapter["incrementOne"] = async <
							Row,
						>(
							input: IncrementOneInput,
						) => {
							if (input.model !== "scimGroup") {
								return transaction.incrementOne<Row>(input);
							}
							const groupId = findWhereValue(input.where, "id");
							const expectedRevision = findWhereValue(input.where, "revision");
							if (
								typeof groupId !== "string" ||
								typeof expectedRevision !== "number" ||
								heldGroupIds.has(groupId)
							) {
								return transaction.incrementOne<Row>(input);
							}

							const previousTail = groupLockTails.get(groupId);
							let release!: () => void;
							const currentTail = new Promise<void>((resolve) => {
								release = resolve;
							});
							groupLockTails.set(groupId, currentTail);
							if (previousTail) cardinalityReadsMayContinue.resolve();
							await previousTail;
							heldGroupIds.add(groupId);
							releases.push(() => {
								release();
								if (groupLockTails.get(groupId) === currentTail) {
									groupLockTails.delete(groupId);
								}
							});

							const liveGroup = data.scimGroup.find(
								(group) => group.id === groupId,
							);
							if (!liveGroup || liveGroup.revision !== expectedRevision) {
								return null;
							}
							return transaction.incrementOne<Row>(input);
						};
						const count: DBTransactionAdapter["count"] = async (input) => {
							if (
								input.model === "scimGroupMember" &&
								typeof findWhereValue(input.where ?? [], "groupId") === "string"
							) {
								cardinalityReadCount++;
								if (cardinalityReadCount === 2) {
									cardinalityReadsMayContinue.resolve();
								}
								await cardinalityReadsMayContinue.promise;
							}
							return transaction.count(input);
						};

						return callback({ ...transaction, count, incrementOne });
					});
				} finally {
					for (const release of releases.reverse()) release();
				}
			},
		};
	};
}

function createFixture() {
	const data = {
		user: [] as User[],
		session: [] as { id: string }[],
		verification: [] as { id: string }[],
		account: [] as { id: string }[],
		scimConnectionBinding: [] as { id: string }[],
		scimIdentityTombstone: [] as { id: string }[],
		scimSubject: [] as { id: string; userId: string }[],
		scimUser: [] as SCIMUserRow[],
		scimGroup: [] as GroupRow[],
		scimGroupMember: [] as GroupMemberRow[],
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
						credentials: [{ type: "bearer", token: "test-scim-token" }],
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

function createMemberReferences(count: number, prefix = "candidate") {
	return Array.from({ length: count }, (_, index) => ({
		value: `${prefix}-${index}`,
	}));
}

function expectCardinalityError(error: unknown, expectSCIMType = true) {
	expect(error).toMatchObject({
		statusCode: 400,
		body: expect.objectContaining({
			status: "400",
			...(expectSCIMType ? { scimType: "invalidValue" } : {}),
		}),
	});
}

describe("SCIM Group direct-member cardinality", () => {
	it("rejects an over-limit Group create without writing the Group", async () => {
		const { auth, data, headers } = createFixture();

		try {
			await auth.api.createSCIMGroup({
				body: {
					schemas: [GROUP_SCHEMA],
					displayName: "Engineering",
					members: createMemberReferences(SCIM_MAX_GROUP_MEMBERS + 1),
				},
				headers,
			});
			throw new Error("Expected Group creation to fail");
		} catch (error) {
			expectCardinalityError(error, false);
		}

		expect(data.scimGroup).toEqual([]);
		expect(data.scimGroupMember).toEqual([]);
	});

	it("rejects an over-limit Group replacement without partial writes", async () => {
		const { auth, data, headers } = createFixture();
		const user = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
			headers,
		});
		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Engineering",
				members: [{ value: user.id }],
			},
			headers,
		});

		try {
			await auth.api.replaceSCIMGroup({
				params: { groupId: group.id },
				body: {
					schemas: [GROUP_SCHEMA],
					displayName: "Renamed Engineering",
					members: createMemberReferences(SCIM_MAX_GROUP_MEMBERS + 1),
				},
				headers,
			});
			throw new Error("Expected Group replacement to fail");
		} catch (error) {
			expectCardinalityError(error, false);
		}

		expect(data.scimGroup.find((row) => row.id === group.id)).toMatchObject({
			displayName: "Engineering",
		});
		expect(data.scimGroupMember).toEqual([
			expect.objectContaining({ groupId: group.id, scimUserId: user.id }),
		]);
	});

	it("rejects an over-limit membership add without partial writes", async () => {
		const { auth, data, headers } = createFixture();
		const user = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
			headers,
		});
		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Engineering",
			},
			headers,
		});
		const createdAt = new Date();
		data.scimGroupMember.push(
			...createMemberReferences(SCIM_MAX_GROUP_MEMBERS, "existing").map(
				(member, index) => ({
					id: `membership-${index}`,
					connectionId: "workforce",
					groupId: group.id,
					scimUserId: member.value,
					membershipKey: `membership-key-${index}`,
					createdAt,
				}),
			),
		);
		const groupUpdatedAt = data.scimGroup.find(
			(row) => row.id === group.id,
		)?.updatedAt;

		try {
			await auth.api.patchSCIMGroup({
				params: { groupId: group.id },
				body: {
					schemas: [PATCH_SCHEMA],
					Operations: [
						{ op: "add", path: "members", value: [{ value: user.id }] },
					],
				},
				headers,
			});
			throw new Error("Expected Group membership addition to fail");
		} catch (error) {
			expectCardinalityError(error);
		}

		expect(data.scimGroupMember).toHaveLength(SCIM_MAX_GROUP_MEMBERS);
		expect(data.scimGroupMember).not.toContainEqual(
			expect.objectContaining({ scimUserId: user.id }),
		);
		expect(
			data.scimGroup.find((row) => row.id === group.id)?.updatedAt,
		).toEqual(groupUpdatedAt);
	});

	it("bounds a Group response when persisted state violates the invariant", async () => {
		const { auth, data, headers } = createFixture();
		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Engineering",
			},
			headers,
		});
		const createdAt = new Date();
		const persistedMembers = createMemberReferences(
			SCIM_MAX_GROUP_MEMBERS + 1,
			"persisted",
		);
		data.scimUser.push(
			...persistedMembers.map((member) => ({
				id: member.value,
				connectionId: "workforce",
				displayName: member.value,
			})),
		);
		data.scimGroupMember.push(
			...persistedMembers.map((member, index) => ({
				id: `persisted-membership-${index}`,
				connectionId: "workforce",
				groupId: group.id,
				scimUserId: member.value,
				membershipKey: `persisted-membership-key-${index}`,
				createdAt,
			})),
		);

		await expect(
			auth.api.getSCIMGroup({
				params: { groupId: group.id },
				headers,
			}),
		).rejects.toMatchObject({
			statusCode: 500,
			body: expect.objectContaining({ status: "500" }),
		});
	});

	it("serializes concurrent additions before enforcing the member limit", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as SCIMSubject[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as GroupRow[],
			scimGroupMember: [] as GroupMemberRow[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: createCardinalityRaceAdapter(data),
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
		const firstCandidate = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "first@example.com" },
			headers,
		});
		const secondCandidate = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "second@example.com" },
			headers,
		});
		const group = await auth.api.createSCIMGroup({
			body: { schemas: [GROUP_SCHEMA], displayName: "Engineering" },
			headers,
		});
		const createdAt = new Date();
		data.scimGroupMember.push(
			...createMemberReferences(SCIM_MAX_GROUP_MEMBERS - 1, "existing").map(
				(member, index) => ({
					id: `membership-${index}`,
					connectionId: "workforce",
					groupId: group.id,
					scimUserId: member.value,
					membershipKey: `membership-key-${index}`,
					createdAt,
				}),
			),
		);

		const mutations = await Promise.allSettled(
			[firstCandidate.id, secondCandidate.id].map((scimUserId) =>
				auth.api.patchSCIMGroup({
					params: { groupId: group.id },
					body: {
						schemas: [PATCH_SCHEMA],
						Operations: [
							{
								op: "add",
								path: "members",
								value: [{ value: scimUserId }],
							},
						],
					},
					headers,
				}),
			),
		);

		expect(
			mutations.filter(({ status }) => status === "fulfilled"),
		).toHaveLength(1);
		const rejectedMutation = mutations.find(
			(mutation) => mutation.status === "rejected",
		);
		expect(rejectedMutation).toMatchObject({
			status: "rejected",
			reason: {
				statusCode: 400,
				body: expect.objectContaining({
					status: "400",
					scimType: "invalidValue",
				}),
			},
		});
		expect(
			data.scimGroupMember.filter(
				(membership) => membership.groupId === group.id,
			),
		).toHaveLength(SCIM_MAX_GROUP_MEMBERS);
		await expect(
			auth.api.getSCIMGroup({ params: { groupId: group.id }, headers }),
		).resolves.toMatchObject({ id: group.id });
	});
});
