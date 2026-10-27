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

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const ADMIN_GROUP = "Admins";

const LEGACY_SQLITE_BOUND_VARIABLE_LIMIT = 999;

function assertBoundVariablesFit(where: readonly Where[] | undefined) {
	for (const clause of where ?? []) {
		if (
			Array.isArray(clause.value) &&
			clause.value.length > LEGACY_SQLITE_BOUND_VARIABLE_LIMIT
		) {
			throw new Error("too many SQL variables");
		}
	}
}

function createBoundVariableLimitedAdapter(data: MemoryDB) {
	return (options: BetterAuthOptions): DBAdapter => {
		const adapter = memoryAdapter(data)(options);
		return {
			...adapter,
			transaction: <Result>(
				callback: (transaction: DBTransactionAdapter) => Promise<Result>,
			) =>
				adapter.transaction((transaction) => {
					const findMany: DBTransactionAdapter["findMany"] = (input) => {
						assertBoundVariablesFit(input.where);
						return transaction.findMany(input);
					};
					const deleteMany: DBTransactionAdapter["deleteMany"] = (input) => {
						assertBoundVariablesFit(input.where);
						return transaction.deleteMany(input);
					};
					return callback({ ...transaction, findMany, deleteMany });
				}),
		};
	};
}

function createFixture({
	defaultFindManyLimit,
	createDatabase = memoryAdapter,
}: {
	defaultFindManyLimit?: number;
	createDatabase?: (
		data: MemoryDB,
	) => (options: BetterAuthOptions) => DBAdapter;
} = {}) {
	const data = {
		user: [] as User[],
		session: [] as { id: string }[],
		verification: [] as { id: string }[],
		account: [] as { id: string }[],
		scimConnectionBinding: [] as { id: string }[],
		scimIdentityTombstone: [] as { id: string }[],
		scimSubject: [] as { id: string }[],
		scimUser: [] as {
			id: string;
			connectionId?: string;
			displayName?: string;
		}[],
		scimGroup: [] as {
			id: string;
			displayName: string;
			displayNameKey: string;
			updatedAt: Date;
		}[],
		scimGroupMember: [] as {
			id: string;
			groupId: string;
			scimUserId: string;
			membershipKey: string;
		}[],
		scimProjectionGrant: [] as {
			userId: string;
			scimUserId: string;
			role: string;
		}[],
	};
	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		database: createDatabase(data),
		advanced: { database: { defaultFindManyLimit } },
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
				projection: {
					roles: {
						map: ({ source }) =>
							source.displayName.startsWith(ADMIN_GROUP) ? ["admin"] : [],
						exists: ({ role }) => role === "admin",
					},
					reconcileUser: () => {},
				},
			}),
		],
	});
	const headers = { authorization: "Bearer test-scim-token" };

	async function createUser(index: number) {
		const user = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: `user-${index}@example.com` },
			headers,
		});
		return user.id;
	}

	async function createUsers(count: number) {
		const ids: string[] = [];
		for (let index = 0; index < count; index++) {
			ids.push(await createUser(index));
		}
		return ids;
	}

	function createGroup(displayName: string, memberIds: string[]) {
		return auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName,
				members: memberIds.map((value) => ({ value })),
			},
			headers,
		});
	}

	function patchMembers(
		groupId: string,
		op: "add" | "remove",
		memberIds: string[],
	) {
		return auth.api.patchSCIMGroup({
			params: { groupId },
			body: {
				schemas: [PATCH_SCHEMA],
				Operations: [
					{
						op,
						path: "members",
						value: memberIds.map((value) => ({ value })),
					},
				],
			},
			headers,
		});
	}

	async function createGroupGrownPast100(displayName: string) {
		const userIds = await createUsers(150);
		const group = await createGroup(displayName, userIds.slice(0, 100));
		await patchMembers(group.id, "add", userIds.slice(100));
		return { group, userIds };
	}

	async function createUserInAdminGroups(groupCount: number) {
		const userId = await createUser(0);
		for (let index = 0; index < groupCount; index++) {
			await createGroup(`${ADMIN_GROUP} ${index}`, [userId]);
		}
		return userId;
	}

	function setActive(userId: string, active: boolean) {
		return auth.api.patchSCIMUser({
			params: { userId },
			body: {
				schemas: [PATCH_SCHEMA],
				Operations: [{ op: "replace", path: "active", value: active }],
			},
			headers,
		});
	}

	function memberIdsOf(groupId: string) {
		return data.scimGroupMember
			.filter((membership) => membership.groupId === groupId)
			.map((membership) => membership.scimUserId)
			.sort();
	}

	function adminGrantCountOf(scimUserId: string) {
		return data.scimProjectionGrant.filter(
			(grant) => grant.scimUserId === scimUserId && grant.role === "admin",
		).length;
	}

	function usersWithAdminGrant() {
		return new Set(
			data.scimProjectionGrant
				.filter((grant) => grant.role === "admin")
				.map((grant) => grant.userId),
		).size;
	}

	return {
		auth,
		data,
		headers,
		createUsers,
		createGroup,
		patchMembers,
		createGroupGrownPast100,
		createUserInAdminGroups,
		setActive,
		memberIdsOf,
		adminGrantCountOf,
		usersWithAdminGrant,
	};
}

/**
 * @see https://github.com/better-auth/better-auth/issues/12066
 */
describe("SCIM Group writes and role mapping past the default findMany limit", () => {
	it("creates a Group with 150 members", async () => {
		const { createUsers, createGroup, memberIdsOf } = createFixture();
		const userIds = await createUsers(150);

		const group = await createGroup("Engineering", userIds);

		expect(memberIdsOf(group.id)).toEqual([...userIds].sort());
	});

	it("removes the members a replace leaves out of a Group grown past 100", async () => {
		const { auth, headers, createGroupGrownPast100, memberIdsOf } =
			createFixture();
		const { group, userIds } = await createGroupGrownPast100("Engineering");
		const kept = userIds.slice(0, 100);

		await auth.api.replaceSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Engineering",
				members: kept.map((value) => ({ value })),
			},
			headers,
		});

		expect(memberIdsOf(group.id)).toEqual([...kept].sort());
	});

	it("removes the members a PATCH replace leaves out of a Group grown past 100", async () => {
		const { auth, headers, createGroupGrownPast100, memberIdsOf } =
			createFixture();
		const { group, userIds } = await createGroupGrownPast100("Engineering");
		const kept = userIds.slice(0, 100);

		await auth.api.patchSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: [PATCH_SCHEMA],
				Operations: [
					{
						op: "replace",
						path: "members",
						value: kept.map((value) => ({ value })),
					},
				],
			},
			headers,
		});

		expect(memberIdsOf(group.id)).toEqual([...kept].sort());
	});

	it("removes 150 members in one PATCH", async () => {
		const { createGroupGrownPast100, patchMembers, memberIdsOf } =
			createFixture();
		const { group, userIds } = await createGroupGrownPast100("Engineering");

		await patchMembers(group.id, "remove", userIds);

		expect(memberIdsOf(group.id)).toEqual([]);
	});

	it("removes the mapped role of every member when a 150-member Group is deleted", async () => {
		const { auth, headers, createGroupGrownPast100, usersWithAdminGrant } =
			createFixture();
		const { group } = await createGroupGrownPast100(ADMIN_GROUP);
		expect(usersWithAdminGrant()).toBe(150);

		await auth.api.deleteSCIMGroup({ params: { groupId: group.id }, headers });

		expect(usersWithAdminGrant()).toBe(0);
	});

	it("maps the role of members who are also in two other Groups", async () => {
		const { createUsers, createGroup, usersWithAdminGrant } = createFixture();
		const userIds = await createUsers(50);
		await createGroup("Team A", userIds);
		await createGroup("Team B", userIds);

		await createGroup(ADMIN_GROUP, userIds);

		expect(usersWithAdminGrant()).toBe(50);
	});

	it("maps a role from each of the 102 Groups a User is in", async () => {
		const { createUserInAdminGroups, adminGrantCountOf } = createFixture();

		const userId = await createUserInAdminGroups(102);

		expect(adminGrantCountOf(userId)).toBe(102);
	});

	it("removes and restores the 102 roles of a User who is deactivated and reactivated", async () => {
		const { createUserInAdminGroups, setActive, adminGrantCountOf } =
			createFixture();
		const userId = await createUserInAdminGroups(102);

		await setActive(userId, false);
		expect(adminGrantCountOf(userId)).toBe(0);

		await setActive(userId, true);
		expect(adminGrantCountOf(userId)).toBe(102);
	});

	it("marks all 102 Groups of a deleted User as modified", async () => {
		const { auth, data, headers, createUserInAdminGroups } = createFixture();
		const userId = await createUserInAdminGroups(102);
		for (const group of data.scimGroup) group.updatedAt = new Date(0);

		await auth.api.deleteSCIMUser({ params: { userId }, headers });

		expect(
			data.scimGroup.filter((group) => group.updatedAt.getTime() === 0),
		).toEqual([]);
	});

	it("maps the role of every member when the default findMany limit is 10", async () => {
		const { createUsers, createGroup, usersWithAdminGrant } = createFixture({
			defaultFindManyLimit: 10,
		});
		const userIds = await createUsers(20);

		await createGroup(ADMIN_GROUP, userIds);

		expect(usersWithAdminGrant()).toBe(20);
	});

	it("maps a role from each of 12 Groups a User is in when the default findMany limit is 10", async () => {
		const { createUserInAdminGroups, adminGrantCountOf } = createFixture({
			defaultFindManyLimit: 10,
		});

		const userId = await createUserInAdminGroups(12);

		expect(adminGrantCountOf(userId)).toBe(12);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12066
 */
describe("SCIM Group writes and role mapping when the database caps bound variables at 999", () => {
	it("applies full Group writes", async () => {
		const { auth, data, headers } = createFixture({
			createDatabase: createBoundVariableLimitedAdapter,
		});
		const members = Array.from(
			{ length: SCIM_MAX_GROUP_MEMBERS },
			(_, index) => ({
				value: `member-${index}`,
			}),
		);
		data.scimUser.push(
			...members.map((member) => ({
				id: member.value,
				connectionId: "workforce",
				displayName: member.value,
			})),
		);

		const group = await auth.api.createSCIMGroup({
			body: { schemas: [GROUP_SCHEMA], displayName: "Engineering", members },
			headers,
		});
		expect(data.scimGroupMember).toHaveLength(SCIM_MAX_GROUP_MEMBERS);
		for (const op of ["remove", "add"] as const) {
			await auth.api.patchSCIMGroup({
				params: { groupId: group.id },
				body: {
					schemas: [PATCH_SCHEMA],
					Operations: [{ op, path: "members", value: members }],
				},
				headers,
			});
		}
		expect(data.scimGroupMember).toHaveLength(SCIM_MAX_GROUP_MEMBERS);

		await auth.api.replaceSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Engineering",
				members: [],
			},
			headers,
		});

		expect(data.scimGroupMember).toEqual([]);
	});

	it("maps, removes and restores the roles of a User in 1001 Groups", async () => {
		const {
			data,
			createGroup,
			createUserInAdminGroups,
			setActive,
			adminGrantCountOf,
		} = createFixture({ createDatabase: createBoundVariableLimitedAdapter });
		const userId = await createUserInAdminGroups(1);
		const [group] = data.scimGroup;
		const [membership] = data.scimGroupMember;
		if (!group || !membership) throw new Error("Group not created");
		for (let index = 0; index < 999; index++) {
			data.scimGroup.push({
				...group,
				id: `seeded-group-${index}`,
				displayName: `${ADMIN_GROUP} seeded ${index}`,
				displayNameKey: `seeded-group-key-${index}`,
			});
			data.scimGroupMember.push({
				...membership,
				id: `seeded-membership-${index}`,
				groupId: `seeded-group-${index}`,
				membershipKey: `seeded-membership-key-${index}`,
			});
		}

		await createGroup(`${ADMIN_GROUP} last`, [userId]);
		expect(adminGrantCountOf(userId)).toBe(1001);

		await setActive(userId, false);
		expect(adminGrantCountOf(userId)).toBe(0);

		await setActive(userId, true);
		expect(adminGrantCountOf(userId)).toBe(1001);
	});
});
