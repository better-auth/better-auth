import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { bearer, organization } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import { scimClient } from "./client";
import type { SCIMOptions } from "./types";

const createTestInstance = (scimOptions?: SCIMOptions) => {
	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};
	let orgCount = 0;

	const data = {
		user: [] as any[],
		session: [] as any[],
		verification: [] as any[],
		account: [] as any[],
		ssoProvider: [] as any[],
		scimProvider: [] as any[],
		organization: [] as any[],
		member: [] as any[],
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

	async function getAuthCookieHeaders() {
		const headers = new Headers();

		await authClient.signUp.email(testUser);
		await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});

		return headers;
	}

	async function registerOrganization() {
		const headers = await getAuthCookieHeaders();
		orgCount += 1;
		return auth.api.createOrganization({
			body: {
				slug: `the-org-${orgCount}`,
				name: `The Organization ${orgCount}`,
			},
			headers,
		});
	}

	async function getSCIMToken(
		providerId: string = "the-saml-provider-1",
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

	async function getOrganizationSCIMToken(providerId = "the-saml-provider-1") {
		const organization = await registerOrganization();
		const scimToken = await getSCIMToken(providerId, organization?.id);
		return { organization, scimToken };
	}

	const headers = (scimToken: string) => ({
		authorization: `Bearer ${scimToken}`,
	});

	const createUser = (scimToken: string, userName: string) =>
		auth.api.createSCIMUser({
			body: { userName },
			headers: headers(scimToken),
		});

	const createGroup = (
		scimToken: string,
		displayName: string,
		members: { value: string; type?: string }[] = [],
	) =>
		auth.api.createSCIMGroup({
			body: { displayName, members },
			headers: headers(scimToken),
		});

	return {
		auth,
		data,
		headers,
		createUser,
		createGroup,
		getSCIMToken,
		getOrganizationSCIMToken,
	};
};

/**
 * @see https://github.com/better-auth/better-auth/issues/9708
 */
describe("SCIM Groups", () => {
	it("should expose Group schema and resource type metadata", async () => {
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

	it("should create, list, and get virtual role groups", async () => {
		const { auth, headers, createUser, createGroup, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const [userA, userB] = await Promise.all([
			createUser(scimToken, "user-a"),
			createUser(scimToken, "user-b"),
		]);

		const group = await createGroup(scimToken, "admin", [
			{ value: userA.id },
			{ value: userB.id },
		]);
		const listedGroups = await auth.api.listSCIMGroups({
			headers: headers(scimToken),
		});
		const retrievedGroup = await auth.api.getSCIMGroup({
			params: { groupId: "admin" },
			headers: headers(scimToken),
		});

		expect(group).toMatchObject({
			id: "admin",
			displayName: "admin",
			members: [
				expect.objectContaining({ value: userA.id }),
				expect.objectContaining({ value: userB.id }),
			],
		});
		expect(listedGroups).toMatchObject({
			totalResults: 2,
			itemsPerPage: 2,
			startIndex: 1,
		});
		expect(listedGroups.Resources).toEqual(
			expect.arrayContaining([
				retrievedGroup,
				expect.objectContaining({ id: "member" }),
			]),
		);
	});

	it("should filter and paginate virtual groups", async () => {
		const { auth, headers, createUser, createGroup, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "user-a");
		await createGroup(scimToken, "admin", [{ value: user.id }]);

		const filtered = await auth.api.listSCIMGroups({
			query: { filter: 'displayName eq "member"' },
			headers: headers(scimToken),
		});
		const paginated = await auth.api.listSCIMGroups({
			query: { startIndex: 2, count: 1 },
			headers: headers(scimToken),
		});

		expect(filtered).toMatchObject({
			totalResults: 1,
			Resources: [expect.objectContaining({ id: "member" })],
		});
		expect(paginated).toMatchObject({
			totalResults: 2,
			startIndex: 2,
			itemsPerPage: 1,
			Resources: [expect.objectContaining({ id: "member" })],
		});
		await expect(
			auth.api.listSCIMGroups({
				query: { filter: 'displayName ne "member"' },
				headers: headers(scimToken),
			}),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "invalidFilter" },
		});
	});

	it("should include role groups on user resources", async () => {
		const { auth, headers, createUser, createGroup, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "user-a");
		await createGroup(scimToken, "admin", [{ value: user.id }]);

		const [retrievedUser, listedUsers] = await Promise.all([
			auth.api.getSCIMUser({
				params: { userId: user.id },
				headers: headers(scimToken),
			}),
			auth.api.listSCIMUsers({
				headers: headers(scimToken),
			}),
		]);

		expect(retrievedUser.groups).toEqual([
			expect.objectContaining({ value: "member" }),
			expect.objectContaining({ value: "admin" }),
		]);
		expect(listedUsers.Resources[0]?.groups).toEqual(retrievedUser.groups);
	});

	it("should replace group membership while preserving unrelated roles", async () => {
		const { auth, headers, createUser, createGroup, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const [userA, userB] = await Promise.all([
			createUser(scimToken, "user-a"),
			createUser(scimToken, "user-b"),
		]);
		await createGroup(scimToken, "admin", [{ value: userA.id }]);

		const updatedGroup = await auth.api.updateSCIMGroup({
			params: { groupId: "admin" },
			body: {
				displayName: "admin",
				members: [{ value: userB.id }],
			},
			headers: headers(scimToken),
		});
		const [userAfterReplace, promotedUser] = await Promise.all([
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
		expect(userAfterReplace.groups).toEqual([
			expect.objectContaining({ value: "member" }),
		]);
		expect(promotedUser.groups).toEqual([
			expect.objectContaining({ value: "member" }),
			expect.objectContaining({ value: "admin" }),
		]);
	});

	it("should patch group membership", async () => {
		const { auth, headers, createUser, createGroup, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const [userA, userB] = await Promise.all([
			createUser(scimToken, "user-a"),
			createUser(scimToken, "user-b"),
		]);
		await createGroup(scimToken, "admin", [{ value: userA.id }]);

		const addedGroup = await auth.api.patchSCIMGroup({
			params: { groupId: "admin" },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{ op: "add", path: "members", value: [{ value: userB.id }] },
				],
			},
			headers: headers(scimToken),
		});
		const removedGroup = await auth.api.patchSCIMGroup({
			params: { groupId: "admin" },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{ op: "remove", path: "members", value: [{ value: userA.id }] },
				],
			},
			headers: headers(scimToken),
		});
		const replacedGroup = await auth.api.patchSCIMGroup({
			params: { groupId: "admin" },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{ op: "replace", path: "members", value: [{ value: userA.id }] },
				],
			},
			headers: headers(scimToken),
		});

		expect(addedGroup.members.map((member) => member.value).sort()).toEqual([
			...[userA.id, userB.id].sort(),
		]);
		expect(removedGroup.members).toEqual([
			expect.objectContaining({ value: userB.id }),
		]);
		expect(replacedGroup.members).toEqual([
			expect.objectContaining({ value: userA.id }),
		]);
	});

	it("should patch remove members using SCIM path filters and bare members paths", async () => {
		const { auth, headers, createUser, createGroup, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const [userA, userB] = await Promise.all([
			createUser(scimToken, "user-a"),
			createUser(scimToken, "user-b"),
		]);
		await createGroup(scimToken, "admin", [
			{ value: userA.id },
			{ value: userB.id },
		]);

		const filteredRemove = await auth.api.patchSCIMGroup({
			params: { groupId: "admin" },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [
					{
						op: "remove",
						path: `members[value eq "${userA.id}"]`,
					},
				],
			},
			headers: headers(scimToken),
		});
		const removeAll = await auth.api.patchSCIMGroup({
			params: { groupId: "admin" },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [{ op: "remove", path: "members" }],
			},
			headers: headers(scimToken),
		});
		const emptyGroup = await auth.api.getSCIMGroup({
			params: { groupId: "admin" },
			headers: headers(scimToken),
		});

		expect(filteredRemove.members).toEqual([
			expect.objectContaining({ value: userB.id }),
		]);
		expect(removeAll.members).toEqual([]);
		expect(emptyGroup.members).toEqual([]);
	});

	it("should delete only the mapped role and keep org membership", async () => {
		const {
			auth,
			data,
			headers,
			createUser,
			createGroup,
			getOrganizationSCIMToken,
		} = createTestInstance();
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "user-a");
		await createGroup(scimToken, "admin", [{ value: user.id }]);

		await auth.api.deleteSCIMGroup({
			params: { groupId: "admin" },
			headers: headers(scimToken),
		});
		const retrievedUser = await auth.api.getSCIMUser({
			params: { userId: user.id },
			headers: headers(scimToken),
		});

		expect(retrievedUser.groups).toEqual([
			expect.objectContaining({ value: "member" }),
		]);
		const scimUserMember = data.member.find(
			(member) => member.userId === user.id,
		);
		expect(scimUserMember?.role).toBe("member");
	});

	it("should support mapping a group to multiple roles", async () => {
		const { auth, headers, createUser, createGroup, getOrganizationSCIMToken } =
			createTestInstance({
				mapGroupToRole: (group) =>
					group.displayName === "Admins" ? ["admin", "editor"] : "member",
			});
		const { scimToken } = await getOrganizationSCIMToken();
		const user = await createUser(scimToken, "user-a");

		await createGroup(scimToken, "Admins", [{ value: user.id }]);
		const retrievedUser = await auth.api.getSCIMUser({
			params: { userId: user.id },
			headers: headers(scimToken),
		});

		expect(retrievedUser.groups).toEqual([
			expect.objectContaining({ value: "member" }),
			expect.objectContaining({ value: "admin" }),
			expect.objectContaining({ value: "editor" }),
		]);
	});

	it("should return SCIM errors for unsupported or invalid group targets", async () => {
		const { createGroup, getSCIMToken } = createTestInstance();
		const nonOrgToken = await getSCIMToken("non-org-provider");

		await expect(createGroup(nonOrgToken, "admin", [])).rejects.toMatchObject({
			body: { status: "400", scimType: "invalidValue" },
		});
	});

	it("should reject duplicate, nested, unknown, and cross-org group members", async () => {
		const { auth, headers, createUser, createGroup, getOrganizationSCIMToken } =
			createTestInstance();
		const { scimToken: orgAToken } =
			await getOrganizationSCIMToken("provider-a");
		const { scimToken: orgBToken } =
			await getOrganizationSCIMToken("provider-b");
		const userA = await createUser(orgAToken, "user-a");
		const userB = await createUser(orgBToken, "user-b");
		await createGroup(orgAToken, "admin", [{ value: userA.id }]);

		await expect(createGroup(orgAToken, "admin", [])).rejects.toMatchObject({
			body: { status: "409", scimType: "uniqueness" },
		});
		await expect(
			createGroup(orgAToken, "admin,editor", [{ value: userA.id }]),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "invalidValue" },
		});
		await expect(
			createGroup(orgAToken, "nested", [{ value: "admin", type: "Group" }]),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "invalidValue" },
		});
		await expect(
			createGroup(orgAToken, "unknown", [{ value: "missing-user-id" }]),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "noTarget" },
		});
		await expect(
			createGroup(orgAToken, "cross-org", [{ value: userB.id }]),
		).rejects.toMatchObject({
			body: { status: "400", scimType: "noTarget" },
		});
		expect(
			await auth.api.getSCIMGroup({
				params: { groupId: "admin" },
				headers: headers(orgAToken),
			}),
		).toMatchObject({
			id: "admin",
			members: [expect.objectContaining({ value: userA.id })],
		});
	});
});
