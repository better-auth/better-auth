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
import type { SCIMSubject } from "./persistence";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

/** Larger than the former 1,000-member cap and SQLite's 999 bound-variable limit. */
const LARGE_GROUP_MEMBER_COUNT = 1_001;

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

function createCardinalityRaceAdapter(
	data: MemoryDB & { scimGroup: GroupRow[] },
) {
	const groupLockTails = new Map<string, Promise<void>>();

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

						return callback({ ...transaction, incrementOne });
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

function createMemberReferences(count: number, prefix = "candidate") {
	return Array.from({ length: count }, (_, index) => ({
		value: `${prefix}-${index}`,
	}));
}

function seedConnectionUsers(
	data: { scimUser: SCIMUserRow[] },
	count: number,
	prefix = "member",
) {
	const members = createMemberReferences(count, prefix);
	data.scimUser.push(
		...members.map((member) => ({
			id: member.value,
			connectionId: "workforce",
			displayName: member.value,
		})),
	);
	return members;
}

function membershipIdsOf(
	data: { scimGroupMember: GroupMemberRow[] },
	groupId: string,
) {
	return data.scimGroupMember
		.filter((membership) => membership.groupId === groupId)
		.map((membership) => membership.scimUserId)
		.sort();
}

async function createGroupWithPersistedMembers(
	{ auth, data, headers }: ReturnType<typeof createFixture>,
	displayName: string,
	memberCount: number,
) {
	const group = await auth.api.createSCIMGroup({
		body: {
			schemas: [GROUP_SCHEMA],
			displayName,
		},
		headers,
	});
	const createdAt = new Date();
	const persistedMembers = seedConnectionUsers(
		data,
		memberCount,
		`${group.id}-persisted`,
	);
	data.scimGroupMember.push(
		...persistedMembers.map((member, index) => ({
			id: `${group.id}-persisted-membership-${index}`,
			connectionId: "workforce",
			groupId: group.id,
			scimUserId: member.value,
			membershipKey: `${group.id}-persisted-membership-key-${index}`,
			createdAt,
		})),
	);
	return { group, persistedMembers };
}

describe("SCIM Group direct-member cardinality", () => {
	it("creates a Group with more than 1000 unique members", async () => {
		const { auth, data, headers } = createFixture();
		const members = seedConnectionUsers(
			data,
			LARGE_GROUP_MEMBER_COUNT,
			"create",
		);

		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Engineering",
				members,
			},
			headers,
		});

		expect(membershipIdsOf(data, group.id)).toEqual(
			members.map((member) => member.value).sort(),
		);
		expect(group.members).toHaveLength(LARGE_GROUP_MEMBER_COUNT);
	});

	it("replaces a Group with more than 1000 unique members without dropping the Group", async () => {
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
		const members = seedConnectionUsers(
			data,
			LARGE_GROUP_MEMBER_COUNT,
			"replace",
		);

		const replaced = await auth.api.replaceSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Renamed Engineering",
				members,
			},
			headers,
		});

		expect(data.scimGroup.find((row) => row.id === group.id)).toMatchObject({
			displayName: "Renamed Engineering",
		});
		expect(membershipIdsOf(data, group.id)).toEqual(
			members.map((member) => member.value).sort(),
		);
		expect(replaced.members).toHaveLength(LARGE_GROUP_MEMBER_COUNT);
		expect(membershipIdsOf(data, group.id)).not.toContain(user.id);
	});

	it("adds a member past 1000 without dropping existing memberships", async () => {
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
		const existing = seedConnectionUsers(
			data,
			LARGE_GROUP_MEMBER_COUNT - 1,
			"existing",
		);
		data.scimGroupMember.push(
			...existing.map((member, index) => ({
				id: `membership-${index}`,
				connectionId: "workforce",
				groupId: group.id,
				scimUserId: member.value,
				membershipKey: `membership-key-${index}`,
				createdAt,
			})),
		);

		const patched = await auth.api.patchSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: [PATCH_SCHEMA],
				Operations: [
					{ op: "add", path: "members", value: [{ value: user.id }] },
				],
			},
			headers,
		});

		expect(membershipIdsOf(data, group.id)).toHaveLength(
			LARGE_GROUP_MEMBER_COUNT,
		);
		expect(membershipIdsOf(data, group.id)).toContain(user.id);
		expect(patched.members).toHaveLength(LARGE_GROUP_MEMBER_COUNT);
	});

	it("returns every persisted member for a Group with more than 1000 members", async () => {
		const fixture = createFixture();
		const { auth, headers } = fixture;
		const { group, persistedMembers } = await createGroupWithPersistedMembers(
			fixture,
			"Engineering",
			LARGE_GROUP_MEMBER_COUNT,
		);

		const resource = await auth.api.getSCIMGroup({
			params: { groupId: group.id },
			headers,
		});
		const listed = await auth.api.listSCIMGroups({
			query: { filter: 'displayName eq "Engineering"' },
			headers,
		});

		expect(resource.members).toHaveLength(LARGE_GROUP_MEMBER_COUNT);
		expect(resource.members?.map((member) => member.value).sort()).toEqual(
			persistedMembers.map((member) => member.value).sort(),
		);
		expect(listed.Resources).toHaveLength(1);
		expect(listed.Resources[0]?.members).toHaveLength(LARGE_GROUP_MEMBER_COUNT);
	});

	it("omits members for a large Group when excludedAttributes=members", async () => {
		const fixture = createFixture();
		const { auth, headers } = fixture;
		const { group } = await createGroupWithPersistedMembers(
			fixture,
			"Engineering",
			LARGE_GROUP_MEMBER_COUNT,
		);

		const resource = await auth.api.getSCIMGroup({
			params: { groupId: group.id },
			query: { excludedAttributes: "members" },
			headers,
		});
		const listed = await auth.api.listSCIMGroups({
			query: {
				filter: 'displayName eq "Engineering"',
				excludedAttributes: "members",
			},
			headers,
		});

		expect(resource).not.toHaveProperty("members");
		expect(listed.Resources).toHaveLength(1);
		expect(listed.Resources[0]).not.toHaveProperty("members");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12066
	 */
	it("empties and deletes Groups with more than 1000 persisted members", async () => {
		const fixture = createFixture();
		const { auth, data, headers } = fixture;
		const { group: replaced } = await createGroupWithPersistedMembers(
			fixture,
			"Engineering",
			LARGE_GROUP_MEMBER_COUNT + 9,
		);
		const { group: deleted } = await createGroupWithPersistedMembers(
			fixture,
			"Platform",
			LARGE_GROUP_MEMBER_COUNT + 9,
		);

		await auth.api.replaceSCIMGroup({
			params: { groupId: replaced.id },
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Engineering",
				members: [],
			},
			headers,
		});
		await auth.api.deleteSCIMGroup({
			params: { groupId: deleted.id },
			headers,
		});

		expect(data.scimGroupMember).toEqual([]);
		expect(data.scimGroup.map((group) => group.id)).toEqual([replaced.id]);
	});

	it("rejects an invalid member in a large create without writing the Group", async () => {
		const { auth, data, headers } = createFixture();
		const members = seedConnectionUsers(
			data,
			LARGE_GROUP_MEMBER_COUNT - 1,
			"valid",
		);

		await expect(
			auth.api.createSCIMGroup({
				body: {
					schemas: [GROUP_SCHEMA],
					displayName: "Engineering",
					members: [...members, { value: "missing-user" }],
				},
				headers,
			}),
		).rejects.toMatchObject({
			statusCode: 400,
			body: expect.objectContaining({
				status: "400",
				scimType: "invalidValue",
			}),
		});

		expect(data.scimGroup).toEqual([]);
		expect(data.scimGroupMember).toEqual([]);
	});

	it("serializes concurrent additions so both members persist", async () => {
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
		).toHaveLength(2);
		expect(
			data.scimGroupMember
				.filter((membership) => membership.groupId === group.id)
				.map((membership) => membership.scimUserId)
				.sort(),
		).toEqual([firstCandidate.id, secondCandidate.id].sort());
		await expect(
			auth.api.getSCIMGroup({ params: { groupId: group.id }, headers }),
		).resolves.toMatchObject({ id: group.id });
	});
});
