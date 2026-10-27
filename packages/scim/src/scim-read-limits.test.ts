import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const ADMIN_GROUP = "Admins";

function createFixture() {
	const data = {
		user: [] as User[],
		session: [] as { id: string }[],
		verification: [] as { id: string }[],
		account: [] as { id: string }[],
		scimConnectionBinding: [] as { id: string }[],
		scimIdentityTombstone: [] as { id: string }[],
		scimSubject: [] as { id: string }[],
		scimUser: [] as { id: string }[],
		scimGroup: [] as { id: string; updatedAt: Date }[],
		scimGroupMember: [] as { groupId: string; scimUserId: string }[],
		scimProjectionGrant: [] as {
			userId: string;
			scimUserId: string;
			role: string;
		}[],
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
});
