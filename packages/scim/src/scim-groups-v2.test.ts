import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";

type SCIMUserRow = {
	id: string;
	connectionId: string;
	userId: string;
};

type SCIMGroupRow = {
	id: string;
	connectionId: string;
	orderKey: string;
	externalId?: string | null;
	displayName: string;
	revision: number;
	updatedAt: Date;
};

type SCIMGroupMemberRow = {
	id: string;
	groupId: string;
	scimUserId: string;
};

describe("SCIM connection-owned Groups", () => {
	it("creates a Group whose membership references a SCIM User resource", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			organization: [] as { id: string }[],
			member: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
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
		const authorization = { authorization: "Bearer test-scim-token" };
		const createdUser = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
				name: { formatted: "Ada Lovelace" },
			},
			headers: authorization,
		});
		const userLink = data.scimUser.find((row) => row.id === createdUser.id);
		if (!userLink) throw new Error("Expected a SCIM User link");

		const createdGroup = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				externalId: "directory-engineering",
				displayName: "Engineering",
				members: [{ value: createdUser.id }],
			},
			headers: authorization,
		});
		const retrievedGroup = await auth.api.getSCIMGroup({
			params: { groupId: createdGroup.id },
			headers: authorization,
		});
		const groupRow = data.scimGroup.find((row) => row.id === createdGroup.id);
		const membership = data.scimGroupMember.find(
			(row) => row.groupId === createdGroup.id,
		);

		expect(createdGroup.id).not.toBe("directory-engineering");
		expect(groupRow).toMatchObject({
			id: createdGroup.id,
			connectionId: "workforce",
			externalId: "directory-engineering",
			displayName: "Engineering",
		});
		expect(membership).toMatchObject({
			groupId: createdGroup.id,
			scimUserId: createdUser.id,
		});
		expect(membership?.scimUserId).not.toBe(userLink.userId);
		expect(membership).not.toHaveProperty("userId");
		expect(retrievedGroup.members).toEqual([
			expect.objectContaining({
				value: createdUser.id,
				$ref: expect.stringContaining(
					`/scim/v2/Users/${encodeURIComponent(createdUser.id)}`,
				),
				display: "Ada Lovelace",
				type: "User",
			}),
		]);
		expect(data.account).toEqual([]);
		expect(data.organization).toEqual([]);
		expect(data.member).toEqual([]);
		expect(data.scimProjectionGrant).toEqual([]);
	});

	it("advances Group metadata when User deletion removes membership", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
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
		const headers = { authorization: "Bearer test-scim-token" };
		const user = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "deleted-member@example.com",
			},
			headers,
		});
		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Deletion metadata",
				members: [{ value: user.id }],
			},
			headers,
		});
		const persistedGroup = data.scimGroup.find((row) => row.id === group.id);
		if (!persistedGroup) throw new Error("Expected a SCIM Group row");
		const previousRevision = persistedGroup.revision;
		persistedGroup.updatedAt = new Date(0);

		await auth.api.deleteSCIMUser({
			params: { userId: user.id },
			headers,
		});

		const retrievedGroup = await auth.api.getSCIMGroup({
			params: { groupId: group.id },
			headers,
		});
		const updatedPersistedGroup = data.scimGroup.find(
			(row) => row.id === group.id,
		);
		if (!retrievedGroup.meta?.lastModified) {
			throw new Error("Expected SCIM Group last-modified metadata");
		}
		expect(retrievedGroup.members).toEqual([]);
		expect(retrievedGroup.meta.lastModified.getTime()).toBeGreaterThan(0);
		expect(updatedPersistedGroup?.revision).toBe(previousRevision + 1);
	});

	it("lists only Groups owned by the authenticated connection", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			organization: [] as { id: string }[],
			member: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce-a",
							credentials: [
								{
									type: "bearer",
									id: "connection-a-token",
									token: "connection-a-token",
								},
							],
						},
						{
							id: "workforce-b",
							credentials: [
								{
									type: "bearer",
									id: "connection-b-token",
									token: "connection-b-token",
								},
							],
						},
					],
				}),
			],
		});
		const connectionAHeaders = {
			authorization: "Bearer connection-a-token",
		};
		const connectionBHeaders = {
			authorization: "Bearer connection-b-token",
		};
		const connectionAGroup = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Engineering A",
				members: [],
			},
			headers: connectionAHeaders,
		});
		const connectionBGroup = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Engineering B",
				members: [],
			},
			headers: connectionBHeaders,
		});

		const listed = await auth.api.listSCIMGroups({
			headers: connectionAHeaders,
		});

		expect(listed).toMatchObject({
			schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
			totalResults: 1,
		});
		expect(listed.Resources.map((group) => group.id)).toEqual([
			connectionAGroup.id,
		]);
		expect(listed.Resources.map((group) => group.id)).not.toContain(
			connectionBGroup.id,
		);
	});

	it("replaces a Group and its connection-owned membership set", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			organization: [] as { id: string }[],
			member: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
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
		const authorization = { authorization: "Bearer test-scim-token" };
		const memberA = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
			},
			headers: authorization,
		});
		const memberB = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "grace@example.com",
			},
			headers: authorization,
		});
		const created = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				externalId: "directory-engineering",
				displayName: "Engineering",
				members: [{ value: memberA.id }],
			},
			headers: authorization,
		});

		const replaced = await auth.api.replaceSCIMGroup({
			params: { groupId: created.id },
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Product Engineering",
				members: [{ value: memberB.id }],
			},
			headers: authorization,
		});
		const retrieved = await auth.api.getSCIMGroup({
			params: { groupId: created.id },
			headers: authorization,
		});
		const groupRow = data.scimGroup.find((group) => group.id === created.id);
		const memberships = data.scimGroupMember.filter(
			(membership) => membership.groupId === created.id,
		);

		expect(replaced.id).toBe(created.id);
		expect(replaced).not.toHaveProperty("externalId");
		expect(groupRow).toMatchObject({
			id: created.id,
			connectionId: "workforce",
			displayName: "Product Engineering",
		});
		expect(groupRow?.externalId).toBeNull();
		expect(memberships).toEqual([
			expect.objectContaining({
				groupId: created.id,
				scimUserId: memberB.id,
			}),
		]);
		expect(memberships).not.toContainEqual(
			expect.objectContaining({ scimUserId: memberA.id }),
		);
		expect(retrieved).toEqual(replaced);
		expect(data.scimProjectionGrant).toEqual([]);
	});

	it("deletes a Group without deleting its provisioned User or policy state", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			organization: [] as { id: string }[],
			member: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
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
		const authorization = { authorization: "Bearer test-scim-token" };
		const createdUser = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
			},
			headers: authorization,
		});
		const userLink = data.scimUser.find((row) => row.id === createdUser.id);
		if (!userLink) throw new Error("Expected a SCIM User link");
		const createdGroup = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Engineering",
				members: [{ value: createdUser.id }],
			},
			headers: authorization,
		});
		const accountsBefore = [...data.account];
		const policyRowsBefore = [...data.scimProjectionGrant];

		await auth.api.deleteSCIMGroup({
			params: { groupId: createdGroup.id },
			headers: authorization,
		});

		expect(data.scimGroup).not.toContainEqual(
			expect.objectContaining({ id: createdGroup.id }),
		);
		expect(data.scimGroupMember).not.toContainEqual(
			expect.objectContaining({ groupId: createdGroup.id }),
		);
		expect(data.scimUser).toContainEqual(
			expect.objectContaining({
				id: createdUser.id,
				userId: userLink.userId,
			}),
		);
		expect(data.user.some((user) => user.id === userLink.userId)).toBe(true);
		await expect(
			auth.api.getSCIMGroup({
				params: { groupId: createdGroup.id },
				headers: authorization,
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				message: "SCIM Group not found",
				body: {
					detail: "SCIM Group not found",
					schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
					status: "404",
				},
			}),
		);
		expect(data.scimProjectionGrant).toEqual(policyRowsBefore);
		expect(data.account).toEqual(accountsBefore);
	});

	it("applies ordered Okta-style Group membership PATCH operations", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			organization: [] as { id: string }[],
			member: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
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
		const authorization = { authorization: "Bearer test-scim-token" };
		const memberA = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
			},
			headers: authorization,
		});
		const memberB = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "grace@example.com",
			},
			headers: authorization,
		});
		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Engineering",
				members: [{ value: memberA.id }],
			},
			headers: authorization,
		});

		await auth.api.patchSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{
						op: "replace",
						path: "urn:ietf:params:scim:schemas:core:2.0:Group:displayName",
						value: "Qualified Engineering",
					},
					{
						op: "add",
						path: "urn:ietf:params:scim:schemas:core:2.0:Group:members",
						value: [{ value: memberB.id }],
					},
				],
			},
			headers: authorization,
		});
		const afterAdd = await auth.api.getSCIMGroup({
			params: { groupId: group.id },
			headers: authorization,
		});
		const membershipsAfterAdd = data.scimGroupMember
			.filter((membership) => membership.groupId === group.id)
			.map((membership) => membership.scimUserId);

		await auth.api.patchSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{
						op: "remove",
						path: `urn:ietf:params:scim:schemas:core:2.0:Group:members[value eq "${memberA.id}"]`,
					},
				],
			},
			headers: authorization,
		});
		const afterRemove = await auth.api.getSCIMGroup({
			params: { groupId: group.id },
			headers: authorization,
		});
		const membershipsAfterRemove = data.scimGroupMember
			.filter((membership) => membership.groupId === group.id)
			.map((membership) => membership.scimUserId);
		if (!afterAdd.members || !afterRemove.members) {
			throw new Error("Expected Group members in the default representation");
		}

		expect(afterAdd.members.map((member) => member.value)).toEqual(
			expect.arrayContaining([memberA.id, memberB.id]),
		);
		expect(afterAdd.members).toHaveLength(2);
		expect(afterAdd.displayName).toBe("Qualified Engineering");
		expect(membershipsAfterAdd).toEqual(
			expect.arrayContaining([memberA.id, memberB.id]),
		);
		expect(membershipsAfterAdd).toHaveLength(2);
		expect(afterRemove.members.map((member) => member.value)).toEqual([
			memberB.id,
		]);
		expect(afterRemove.displayName).toBe("Qualified Engineering");
		expect(membershipsAfterRemove).toEqual([memberB.id]);
	});

	it("removes Entra-style Group members from a value list", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			organization: [] as { id: string }[],
			member: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
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
		const authorization = { authorization: "Bearer test-scim-token" };
		const memberA = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
			},
			headers: authorization,
		});
		const memberB = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "grace@example.com",
			},
			headers: authorization,
		});
		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Engineering",
				members: [{ value: memberA.id }, { value: memberB.id }],
			},
			headers: authorization,
		});

		await auth.api.patchSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{
						op: "remove",
						path: "members",
						value: [{ value: memberA.id }],
					},
				],
			},
			headers: authorization,
		});
		const afterRemove = await auth.api.getSCIMGroup({
			params: { groupId: group.id },
			headers: authorization,
		});
		const memberships = data.scimGroupMember
			.filter((membership) => membership.groupId === group.id)
			.map((membership) => membership.scimUserId);
		if (!afterRemove.members) {
			throw new Error("Expected Group members in the default representation");
		}

		expect(afterRemove.members.map((member) => member.value)).toEqual([
			memberB.id,
		]);
		expect(memberships).toEqual([memberB.id]);
	});

	it("patches Group attributes without conflating them with membership policy", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
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
		const authorization = { authorization: "Bearer test-scim-token" };
		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				externalId: "directory-engineering",
				displayName: "Engineering",
			},
			headers: authorization,
		});

		await auth.api.patchSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{
						op: "replace",
						value: { id: group.id, displayName: "Platform" },
					},
					{ op: "remove", path: "externalId" },
				],
			},
			headers: authorization,
		});
		const patched = await auth.api.getSCIMGroup({
			params: { groupId: group.id },
			headers: authorization,
		});
		const groupRow = data.scimGroup.find((row) => row.id === group.id);

		expect(patched).toMatchObject({
			id: group.id,
			displayName: "Platform",
			members: [],
		});
		expect(patched).not.toHaveProperty("externalId");
		expect(groupRow).toMatchObject({ displayName: "Platform" });
		expect(groupRow?.externalId).toBeNull();
		expect(data.scimProjectionGrant).toEqual([]);
	});

	it("enforces connection-scoped, case-insensitive Group displayName uniqueness", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
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
		const headers = { authorization: "Bearer test-scim-token" };
		await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Engineering",
			},
			headers,
		});
		const platform = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Platform",
			},
			headers,
		});

		await expect(
			auth.api.createSCIMGroup({
				body: {
					schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
					displayName: "engineering",
				},
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				status: "409",
				scimType: "uniqueness",
			}),
		});
		await expect(
			auth.api.patchSCIMGroup({
				params: { groupId: platform.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{ op: "replace", path: "displayName", value: "ENGINEERING" },
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
		expect(
			data.scimGroup.find((group) => group.id === platform.id),
		).toMatchObject({ displayName: "Platform" });
	});

	it("filters, paginates, and projects the connection-owned Group collection", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			organization: [] as { id: string }[],
			member: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce-a",
							credentials: [
								{
									type: "bearer",
									id: "connection-a-token",
									token: "connection-a-token",
								},
							],
						},
						{
							id: "workforce-b",
							credentials: [
								{
									type: "bearer",
									id: "connection-b-token",
									token: "connection-b-token",
								},
							],
						},
					],
				}),
			],
		});
		const connectionAHeaders = {
			authorization: "Bearer connection-a-token",
		};
		const connectionBHeaders = {
			authorization: "Bearer connection-b-token",
		};
		const member = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
			},
			headers: connectionAHeaders,
		});
		const engineering = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Engineering",
				members: [{ value: member.id }],
			},
			headers: connectionAHeaders,
		});
		await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Finance",
				members: [],
			},
			headers: connectionAHeaders,
		});
		await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Support",
				members: [],
			},
			headers: connectionAHeaders,
		});
		const otherConnectionEngineering = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Engineering",
				members: [],
			},
			headers: connectionBHeaders,
		});

		const filtered = await auth.api.listSCIMGroups({
			query: { filter: 'displayName eq "Engineering"' },
			headers: connectionAHeaders,
		});
		const secondPage = await auth.api.listSCIMGroups({
			query: { startIndex: 2, count: 1 },
			headers: connectionAHeaders,
		});
		const withoutMembers = await auth.api.listSCIMGroups({
			query: {
				filter: 'displayName eq "Engineering"',
				excludedAttributes: "members",
			},
			headers: connectionAHeaders,
		});
		const expectedSecondPageId = data.scimGroup
			.filter((group) => group.connectionId === "workforce-a")
			.sort((left, right) =>
				left.orderKey.localeCompare(right.orderKey),
			)[1]?.id;

		expect(filtered).toMatchObject({
			totalResults: 1,
			startIndex: 1,
			itemsPerPage: 1,
		});
		expect(filtered.Resources.map((group) => group.id)).toEqual([
			engineering.id,
		]);
		expect(filtered.Resources.map((group) => group.id)).not.toContain(
			otherConnectionEngineering.id,
		);
		expect(secondPage).toMatchObject({
			totalResults: 3,
			startIndex: 2,
			itemsPerPage: 1,
		});
		expect(secondPage.Resources.map((group) => group.id)).toEqual([
			expectedSecondPageId,
		]);
		expect(data.scimGroupMember).toContainEqual(
			expect.objectContaining({
				groupId: engineering.id,
				scimUserId: member.id,
			}),
		);
		expect(withoutMembers.Resources).toHaveLength(1);
		expect(withoutMembers.Resources[0]).not.toHaveProperty("members");
	});
});
