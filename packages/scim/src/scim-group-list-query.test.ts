import type { BetterAuthOptions, DBAdapter, User } from "better-auth";
import { betterAuth } from "better-auth";
import type { MemoryDB } from "better-auth/adapters/memory";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMGroupMember } from "./persistence";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const headers = { authorization: "Bearer test-scim-token" };

interface GroupListData extends MemoryDB {
	user: User[];
	scimUser: Array<{
		id: string;
		connectionId: string;
		displayName: string;
	}>;
	scimGroupMember: SCIMGroupMember[];
}

function createData(): GroupListData {
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

function createQueryCountingAdapter(data: GroupListData) {
	const findManyCalls = new Map<string, number>();
	return {
		database: (options: BetterAuthOptions): DBAdapter => {
			const adapter = memoryAdapter(data)(options);
			return {
				...adapter,
				findMany: async (input) => {
					findManyCalls.set(
						input.model,
						(findManyCalls.get(input.model) ?? 0) + 1,
					);
					return adapter.findMany(input);
				},
			};
		},
		countFindManyCalls(model: string) {
			return findManyCalls.get(model) ?? 0;
		},
		reset() {
			findManyCalls.clear();
		},
	};
}

describe("SCIM Group collection queries", () => {
	it("loads one page of Group memberships and Users in batches", async () => {
		const data = createData();
		const queries = createQueryCountingAdapter(data);
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: queries.database,
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
		const ada = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
			headers,
		});
		const grace = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "grace@example.com" },
			headers,
		});
		await auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Engineering",
				members: [{ value: ada.id }, { value: grace.id }],
			},
			headers,
		});
		await auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Research",
				members: [{ value: grace.id }],
			},
			headers,
		});
		queries.reset();

		const page = await auth.api.listSCIMGroups({ headers });

		expect(page.Resources).toHaveLength(2);
		expect(page.Resources.map((group) => group.members?.length)).toEqual([
			2, 1,
		]);
		expect(queries.countFindManyCalls("scimGroupMember")).toBe(1);
		expect(queries.countFindManyCalls("scimUser")).toBe(1);
	});

	it("returns every member of a Group with more than 1000 members in a batched collection response", async () => {
		const data = createData();
		const queries = createQueryCountingAdapter(data);
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: queries.database,
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
		const largeGroup = await auth.api.createSCIMGroup({
			body: { schemas: [GROUP_SCHEMA], displayName: "Engineering" },
			headers,
		});
		await auth.api.createSCIMGroup({
			body: { schemas: [GROUP_SCHEMA], displayName: "Research" },
			headers,
		});
		const createdAt = new Date();
		const members = Array.from({ length: 1_001 }, (_, index) => ({
			id: `user-${index}`,
			connectionId: "workforce",
			displayName: `user-${index}`,
		}));
		data.scimUser.push(...members);
		data.scimGroupMember.push(
			...members.map((member, index) => ({
				id: `membership-${index}`,
				connectionId: "workforce",
				groupId: largeGroup.id,
				scimUserId: member.id,
				membershipKey: `membership-key-${index}`,
				createdAt,
			})),
		);
		queries.reset();

		const page = await auth.api.listSCIMGroups({ headers });

		expect(page.Resources).toHaveLength(2);
		const listedLargeGroup = page.Resources.find(
			(group) => group.id === largeGroup.id,
		);
		expect(listedLargeGroup?.members).toHaveLength(1_001);
		expect(queries.countFindManyCalls("scimGroupMember")).toBe(1);
		expect(queries.countFindManyCalls("scimUser")).toBe(3);
	});
});
