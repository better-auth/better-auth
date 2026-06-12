import { sso } from "@better-auth/sso";
import type { Account, User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import type { Member } from "better-auth/plugins";
import { bearer, organization } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import { scimClient } from "./client";
import type {
	SCIMGroup,
	SCIMGroupInput,
	SCIMGroupMember,
	SCIMGroupRole,
	SCIMGroupRoleGrant,
	SCIMOptions,
	SCIMProvider,
} from "./types";

const createTestInstance = (scimOptions?: SCIMOptions) => {
	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};

	let organizationCount = 0;
	const data = {
		user: [] as User[],
		session: [],
		verification: [],
		account: [] as Account[],
		ssoProvider: [],
		scimProvider: [] as SCIMProvider[],
		organization: [],
		member: [] as Member[],
		scimGroup: [] as SCIMGroup[],
		scimGroupMember: [] as SCIMGroupMember[],
		scimGroupRole: [] as SCIMGroupRole[],
		scimGroupRoleGrant: [] as SCIMGroupRoleGrant[],
	};
	const memory = memoryAdapter(data);

	const auth = betterAuth({
		database: memory,
		baseURL: "http://localhost:3000",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [sso(), scim(scimOptions), organization()],
	});

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [bearer(), scimClient()],
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	async function getAuthCookieHeaders(
		user: { email: string; password: string; name: string } = testUser,
	) {
		const headers = new Headers();

		await authClient.signUp.email(user);
		await authClient.signIn.email(user, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});

		return headers;
	}

	async function registerOrganization() {
		const headers = await getAuthCookieHeaders();
		organizationCount += 1;

		return await auth.api.createOrganization({
			body: {
				slug: `scim-groups-${organizationCount}`,
				name: `SCIM Groups ${organizationCount}`,
			},
			headers,
		});
	}

	async function getSCIMToken(
		providerId: string = "scim-groups-provider",
		organizationId?: string,
	) {
		const headers = await getAuthCookieHeaders();
		const { scimToken } = await auth.api.generateSCIMToken({
			body: {
				providerId,
				organizationId,
			},
			headers,
		});

		return scimToken;
	}

	async function getOrganizationSCIMToken(providerId = "scim-groups-provider") {
		const org = await registerOrganization();
		const scimToken = await getSCIMToken(providerId, org?.id);
		return { organization: org, scimToken };
	}

	const headers = (scimToken: string) => ({
		authorization: `Bearer ${scimToken}`,
	});

	const createUser = (scimToken: string, userName: string) =>
		auth.api.createSCIMUser({
			body: { userName },
			headers: headers(scimToken),
		});

	const createGroup = (scimToken: string, group: SCIMGroupInput) =>
		auth.api.createSCIMGroup({
			body: group,
			headers: headers(scimToken),
		});

	return {
		auth,
		data,
		headers,
		createGroup,
		createUser,
		getSCIMToken,
		getOrganizationSCIMToken,
	};
};

describe("SCIM Groups", () => {
	it("exposes Group schema and resource type metadata", async () => {
		const { auth } = createTestInstance();

		const [schemas, resourceTypes] = await Promise.all([
			auth.api.getSCIMSchemas(),
			auth.api.getSCIMResourceTypes(),
		]);

		expect(schemas.Resources.map((schema) => schema.id)).toContain(
			"urn:ietf:params:scim:schemas:core:2.0:Group",
		);
		expect(resourceTypes.Resources).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "Group",
					endpoint: "/Groups",
					schema: "urn:ietf:params:scim:schemas:core:2.0:Group",
				}),
			]),
		);
	});

	it("creates and returns an empty durable Group resource", async () => {
		const { auth, headers, createGroup, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();

		const createdGroup = await createGroup(scimToken, {
			externalId: "idp-admins",
			displayName: "Admins",
		});
		const listedGroups = await auth.api.listSCIMGroups({
			headers: headers(scimToken),
		});
		const filteredGroups = await auth.api.listSCIMGroups({
			query: { filter: 'displayName eq "Admins"' },
			headers: headers(scimToken),
		});
		const caseInsensitiveFilteredGroups = await auth.api.listSCIMGroups({
			query: { filter: 'DisplayName Eq "admins"' },
			headers: headers(scimToken),
		});
		const retrievedGroup = await auth.api.getSCIMGroup({
			params: { groupId: createdGroup.id },
			headers: headers(scimToken),
		});

		expect(createdGroup).toMatchObject({
			externalId: "idp-admins",
			displayName: "Admins",
			members: [],
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
		});
		expect(createdGroup.id).not.toBe("Admins");
		expect(retrievedGroup).toEqual(createdGroup);
		expect(listedGroups).toMatchObject({
			totalResults: 1,
			itemsPerPage: 1,
			Resources: [createdGroup],
		});
		expect(filteredGroups.Resources).toEqual([createdGroup]);
		expect(caseInsensitiveFilteredGroups.Resources).toEqual([createdGroup]);

		await expect(
			auth.api.listSCIMGroups({
				query: { filter: 'displayName ne "Admins"' },
				headers: headers(scimToken),
			}),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "invalidFilter" },
		});
	});

	it("rejects duplicate externalId values in the provider organization scope", async () => {
		const { createGroup, getOrganizationSCIMToken } = createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();

		await createGroup(scimToken, {
			externalId: "idp-admins",
			displayName: "Admins",
		});

		await expect(
			createGroup(scimToken, {
				externalId: "idp-admins",
				displayName: "Admins copy",
			}),
		).rejects.toMatchObject({
			body: { status: "409", scimType: "uniqueness" },
		});
	});

	it("paginates Group lists while preserving totalResults", async () => {
		const { auth, headers, createGroup, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const [admins, editors, viewers] = await Promise.all([
			createGroup(scimToken, { displayName: "Admins" }),
			createGroup(scimToken, { displayName: "Editors" }),
			createGroup(scimToken, { displayName: "Viewers" }),
		]);

		const listedGroups = await auth.api.listSCIMGroups({
			query: { startIndex: 2, count: 1 },
			headers: headers(scimToken),
		});
		const groupIds = new Set([admins.id, editors.id, viewers.id]);

		expect(listedGroups).toMatchObject({
			totalResults: 3,
			itemsPerPage: 1,
			startIndex: 2,
		});
		expect(listedGroups.Resources).toHaveLength(1);
		expect(groupIds.has(listedGroups.Resources[0]?.id ?? "")).toBe(true);
	});

	it("references SCIM Group resources from User responses", async () => {
		const { auth, headers, createGroup, createUser, getOrganizationSCIMToken } =
			createTestInstance({
				mapGroupToRoles: ({ group }) =>
					group.displayName === "Admins" ? ["admin"] : ["member"],
			});
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "group-member@test.com");

		const group = await createGroup(scimToken, {
			displayName: "Admins",
			members: [{ value: user.id }],
		});
		const retrievedUser = await auth.api.getSCIMUser({
			params: { userId: user.id },
			headers: headers(scimToken),
		});
		const listedUsers = await auth.api.listSCIMUsers({
			headers: headers(scimToken),
		});

		expect(retrievedUser.groups).toEqual([
			{
				value: group.id,
				$ref: group.meta.location,
				display: "Admins",
			},
		]);
		expect(retrievedUser.groups?.[0]?.value).not.toBe("admin");
		expect(listedUsers.Resources[0]?.groups).toEqual(retrievedUser.groups);
	});

	it("URL-encodes Group member references", async () => {
		const { data, createGroup, createUser, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "opaque-member@test.com");
		const opaqueUserId = `${user.id}/opaque id`;
		const userRecord = data.user.find((entry) => entry.id === user.id);
		const account = data.account.find((entry) => entry.userId === user.id);
		const member = data.member.find((entry) => entry.userId === user.id);
		if (!userRecord || !account || !member) {
			throw new Error("Expected SCIM user, account, and organization member");
		}
		userRecord.id = opaqueUserId;
		account.userId = opaqueUserId;
		member.userId = opaqueUserId;

		const group = await createGroup(scimToken, {
			displayName: "Opaque members",
			members: [{ value: opaqueUserId }],
		});

		expect(group.members).toEqual([
			expect.objectContaining({
				value: opaqueUserId,
				$ref: `http://localhost:3000/api/auth/scim/v2/Users/${encodeURIComponent(
					opaqueUserId,
				)}`,
			}),
		]);
	});

	it("projects multiple mapped roles for the same member", async () => {
		const { data, createGroup, createUser, getOrganizationSCIMToken } =
			createTestInstance({
				mapGroupToRoles: () => ["admin", "editor"],
			});
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "multi-role@test.com");

		await createGroup(scimToken, {
			displayName: "Multi role",
			members: [{ value: user.id }],
		});

		const member = data.member.find((entry) => entry.userId === user.id);
		expect(member?.role.split(",").sort()).toEqual([
			"admin",
			"editor",
			"member",
		]);
	});

	it("projects mapped roles and preserves manual same-name roles on delete", async () => {
		const {
			auth,
			data,
			headers,
			createGroup,
			createUser,
			getOrganizationSCIMToken,
		} = createTestInstance({
			mapGroupToRoles: ({ group }) =>
				group.displayName === "Admins" ? ["admin", "editor"] : ["member"],
		});
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "manual-admin@test.com");
		const findMember = () =>
			data.member.find((entry) => entry.userId === user.id);
		const member = findMember();
		if (!member) throw new Error("Expected SCIM user to have org membership");
		member.role = "member,admin";

		const group = await createGroup(scimToken, {
			displayName: "Admins",
			members: [{ value: user.id }],
		});
		expect(findMember()?.role.split(",").sort()).toEqual([
			"admin",
			"editor",
			"member",
		]);

		await auth.api.deleteSCIMGroup({
			params: { groupId: group.id },
			headers: headers(scimToken),
		});

		expect(findMember()?.role.split(",").sort()).toEqual(["admin", "member"]);
	});

	it("removes shared SCIM-projected roles after the last granting Group is deleted", async () => {
		const {
			auth,
			data,
			headers,
			createGroup,
			createUser,
			getOrganizationSCIMToken,
		} = createTestInstance({
			mapGroupToRoles: () => ["admin"],
		});
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "shared-role@test.com");
		const findMember = () =>
			data.member.find((entry) => entry.userId === user.id);

		const groupA = await createGroup(scimToken, {
			displayName: "Admins A",
			members: [{ value: user.id }],
		});
		const groupB = await createGroup(scimToken, {
			displayName: "Admins B",
			members: [{ value: user.id }],
		});
		expect(findMember()?.role.split(",").sort()).toEqual(["admin", "member"]);

		await auth.api.deleteSCIMGroup({
			params: { groupId: groupA.id },
			headers: headers(scimToken),
		});
		expect(findMember()?.role.split(",").sort()).toEqual(["admin", "member"]);

		await auth.api.deleteSCIMGroup({
			params: { groupId: groupB.id },
			headers: headers(scimToken),
		});
		expect(findMember()?.role).toBe("member");
	});

	it("replaces membership and removes only SCIM-projected roles", async () => {
		const {
			auth,
			data,
			headers,
			createGroup,
			createUser,
			getOrganizationSCIMToken,
		} = createTestInstance({
			mapGroupToRoles: ({ group }) =>
				group.displayName === "Admins" ? ["admin"] : ["member"],
		});
		const { scimToken } = await getOrganizationSCIMToken();
		const [userA, userB] = await Promise.all([
			createUser(scimToken, "user-a@test.com"),
			createUser(scimToken, "user-b@test.com"),
		]);
		const group = await createGroup(scimToken, {
			displayName: "Admins",
			members: [{ value: userA.id }],
		});

		const updatedGroup = await auth.api.updateSCIMGroup({
			params: { groupId: group.id },
			body: {
				displayName: "Admins",
				members: [{ value: userB.id }],
			},
			headers: headers(scimToken),
		});

		const memberA = data.member.find((entry) => entry.userId === userA.id);
		const memberB = data.member.find((entry) => entry.userId === userB.id);
		const [retrievedUserA, retrievedUserB] = await Promise.all([
			auth.api.getSCIMUser({
				params: { userId: userA.id },
				headers: headers(scimToken),
			}),
			auth.api.getSCIMUser({
				params: { userId: userB.id },
				headers: headers(scimToken),
			}),
		]);

		expect(updatedGroup.members).toEqual([
			expect.objectContaining({ value: userB.id }),
		]);
		expect(memberA?.role).toBe("member");
		expect(memberB?.role.split(",").sort()).toEqual(["admin", "member"]);
		expect(retrievedUserA.groups).toBeUndefined();
		expect(retrievedUserB.groups).toEqual([
			expect.objectContaining({ value: group.id, display: "Admins" }),
		]);
	});

	it("applies Group PATCH atomically", async () => {
		const { auth, headers, createGroup, createUser, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "patch-member@test.com");
		const group = await createGroup(scimToken, {
			displayName: "Patch Target",
		});

		await expect(
			auth.api.patchSCIMGroup({
				params: { groupId: group.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{ op: "replace", path: "displayName", value: "Changed" },
						{ op: "add", path: "unsupported", value: "ignored" },
					],
				},
				headers: headers(scimToken),
			}),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "invalidPath" },
		});

		const unchangedGroup = await auth.api.getSCIMGroup({
			params: { groupId: group.id },
			headers: headers(scimToken),
		});
		expect(unchangedGroup.displayName).toBe("Patch Target");

		await expect(
			auth.api.patchSCIMGroup({
				params: { groupId: group.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [{ op: "add", path: "members", value: [{}] }],
				},
				headers: headers(scimToken),
			}),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "invalidValue" },
		});

		const patchedGroup = await auth.api.patchSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{ op: "replace", path: "displayName", value: "Changed" },
					{ op: "add", path: "members", value: [{ value: user.id }] },
				],
			},
			headers: headers(scimToken),
		});

		expect(patchedGroup).toMatchObject({
			id: group.id,
			displayName: "Changed",
			members: [expect.objectContaining({ value: user.id })],
		});
	});

	it("rejects empty Group displayName PATCH values", async () => {
		const { auth, headers, createGroup, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const group = await createGroup(scimToken, {
			displayName: "Required name",
		});

		await expect(
			auth.api.patchSCIMGroup({
				params: { groupId: group.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [{ op: "replace", path: "displayName", value: "" }],
				},
				headers: headers(scimToken),
			}),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "invalidValue" },
		});
		await expect(
			auth.api.patchSCIMGroup({
				params: { groupId: group.id },
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [{ op: "replace", value: { displayName: "" } }],
				},
				headers: headers(scimToken),
			}),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "invalidValue" },
		});

		const unchangedGroup = await auth.api.getSCIMGroup({
			params: { groupId: group.id },
			headers: headers(scimToken),
		});
		expect(unchangedGroup.displayName).toBe("Required name");
	});

	it("preserves dots in Group PATCH member filter values", async () => {
		const {
			auth,
			data,
			headers,
			createGroup,
			createUser,
			getOrganizationSCIMToken,
		} = createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "dot-member@test.com");
		const dottedUserId = `${user.id}.scim`;
		const userRecord = data.user.find((entry) => entry.id === user.id);
		const account = data.account.find((entry) => entry.userId === user.id);
		const member = data.member.find((entry) => entry.userId === user.id);
		if (!userRecord || !account || !member) {
			throw new Error("Expected SCIM user, account, and organization member");
		}
		userRecord.id = dottedUserId;
		account.userId = dottedUserId;
		member.userId = dottedUserId;

		const group = await createGroup(scimToken, {
			displayName: "Dotted members",
			members: [{ value: dottedUserId }],
		});

		const patchedGroup = await auth.api.patchSCIMGroup({
			params: { groupId: group.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{
						op: "remove",
						path: `members[value eq "${dottedUserId}"]`,
					},
				],
			},
			headers: headers(scimToken),
		});
		const retrievedUser = await auth.api.getSCIMUser({
			params: { userId: dottedUserId },
			headers: headers(scimToken),
		});

		expect(patchedGroup.members).toEqual([]);
		expect(retrievedUser.groups).toBeUndefined();
	});

	it("removes SCIM Group links when deleting an organization-scoped user", async () => {
		const {
			auth,
			data,
			headers,
			createGroup,
			createUser,
			getOrganizationSCIMToken,
		} = createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "delete-member@test.com");
		const group = await createGroup(scimToken, {
			displayName: "Delete cleanup",
			members: [{ value: user.id }],
		});

		await auth.api.deleteSCIMUser({
			params: { userId: user.id },
			headers: headers(scimToken),
		});

		expect(
			data.scimGroupMember.some((membership) => membership.userId === user.id),
		).toBe(false);
		expect(
			data.scimGroupRoleGrant.some((grant) => grant.userId === user.id),
		).toBe(false);
		expect(data.scimGroup.some((entry) => entry.scimGroupId === group.id)).toBe(
			true,
		);
	});

	it("rejects non-org tokens and invalid group members", async () => {
		const {
			auth,
			headers,
			createGroup,
			createUser,
			getSCIMToken,
			getOrganizationSCIMToken,
		} = createTestInstance();
		const nonOrgToken = await getSCIMToken("personal-provider");
		const { scimToken: orgAToken } =
			await getOrganizationSCIMToken("provider-a");
		const { scimToken: orgBToken } =
			await getOrganizationSCIMToken("provider-b");
		const userA = await createUser(orgAToken, "org-a@test.com");
		const userB = await createUser(orgBToken, "org-b@test.com");

		await expect(
			createGroup(nonOrgToken, { displayName: "Personal" }),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "invalidValue" },
		});
		await expect(
			createGroup(orgAToken, {
				displayName: "Nested",
				members: [{ value: "group-id", type: "Group" }],
			}),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "invalidValue" },
		});
		await expect(
			createGroup(orgAToken, {
				displayName: "Unknown",
				members: [{ value: "missing-user" }],
			}),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "noTarget" },
		});
		await expect(
			createGroup(orgAToken, {
				displayName: "Cross org",
				members: [{ value: userB.id }],
			}),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "noTarget" },
		});

		const group = await createGroup(orgAToken, {
			displayName: "Valid",
			members: [{ value: userA.id }],
		});
		await expect(
			auth.api.getSCIMGroup({
				params: { groupId: "missing-group" },
				headers: headers(orgAToken),
			}),
		).rejects.toMatchObject({
			body: { status: "404" },
		});
		expect(group.members).toEqual([
			expect.objectContaining({ value: userA.id }),
		]);
	});
});
