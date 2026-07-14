import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

function createFixture() {
	const data = {
		user: [] as User[],
		session: [] as { id: string }[],
		verification: [] as { id: string }[],
		account: [] as { id: string }[],
		scimConnectionBinding: [] as { id: string }[],
		scimIdentityTombstone: [] as { id: string }[],
		scimSubject: [] as { id: string; userId: string }[],
		scimUser: [] as { id: string }[],
		scimGroup: [] as { id: string }[],
		scimGroupMember: [] as { id: string }[],
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
		headers: { authorization: "Bearer test-scim-token" },
	};
}

async function createUserAndGroup() {
	const fixture = createFixture();
	const user = await fixture.auth.api.createSCIMUser({
		body: {
			schemas: [USER_SCHEMA],
			userName: "ada@example.com",
			displayName: "Ada Lovelace",
			name: { givenName: "Ada", familyName: "Lovelace" },
		},
		headers: fixture.headers,
	});
	const group = await fixture.auth.api.createSCIMGroup({
		body: {
			schemas: [GROUP_SCHEMA],
			displayName: "Engineering",
			members: [{ value: user.id }],
		},
		headers: fixture.headers,
	});

	return { ...fixture, user, group };
}

describe("SCIM core-schema-qualified attribute projection", () => {
	it("projects included and excluded User attributes on an item", async () => {
		const { auth, headers, user } = await createUserAndGroup();

		const included = await auth.api.getSCIMUser({
			params: { userId: user.id },
			query: {
				attributes: `${USER_SCHEMA}:userName,${USER_SCHEMA}:name.givenName`,
			},
			headers,
		});
		const excluded = await auth.api.getSCIMUser({
			params: { userId: user.id },
			query: {
				excludedAttributes: `${USER_SCHEMA}:displayName,${USER_SCHEMA}:name.familyName`,
			},
			headers,
		});

		expect(included).toEqual({
			schemas: [USER_SCHEMA],
			id: user.id,
			userName: "ada@example.com",
			name: { givenName: "Ada" },
		});
		expect(excluded).not.toHaveProperty("displayName");
		expect(excluded).not.toHaveProperty("name.familyName");
		expect(excluded.name).toMatchObject({ givenName: "Ada" });
	});

	it("projects included and excluded User attributes in a collection", async () => {
		const { auth, headers, user } = await createUserAndGroup();

		const included = await auth.api.listSCIMUsers({
			query: { attributes: `${USER_SCHEMA}:displayName` },
			headers,
		});
		const excluded = await auth.api.listSCIMUsers({
			query: { excludedAttributes: `${USER_SCHEMA}:name` },
			headers,
		});

		expect(included.Resources).toEqual([
			{
				schemas: [USER_SCHEMA],
				id: user.id,
				displayName: "Ada Lovelace",
			},
		]);
		expect(excluded.Resources[0]).not.toHaveProperty("name");
		expect(excluded.Resources[0]).toMatchObject({
			id: user.id,
			userName: "ada@example.com",
			displayName: "Ada Lovelace",
		});
	});

	it("projects included and excluded Group attributes on an item", async () => {
		const { auth, headers, user, group } = await createUserAndGroup();

		const included = await auth.api.getSCIMGroup({
			params: { groupId: group.id },
			query: {
				attributes: `${GROUP_SCHEMA}:displayName,${GROUP_SCHEMA}:members.value`,
			},
			headers,
		});
		const excluded = await auth.api.getSCIMGroup({
			params: { groupId: group.id },
			query: { excludedAttributes: `${GROUP_SCHEMA}:members` },
			headers,
		});

		expect(included).toEqual({
			schemas: [GROUP_SCHEMA],
			id: group.id,
			displayName: "Engineering",
			members: [{ value: user.id }],
		});
		expect(excluded).not.toHaveProperty("members");
		expect(excluded).toHaveProperty("displayName", "Engineering");
	});

	it("projects included and excluded Group attributes in a collection", async () => {
		const { auth, headers, user, group } = await createUserAndGroup();

		const included = await auth.api.listSCIMGroups({
			query: { attributes: `${GROUP_SCHEMA}:members.value` },
			headers,
		});
		const excluded = await auth.api.listSCIMGroups({
			query: { excludedAttributes: `${GROUP_SCHEMA}:displayName` },
			headers,
		});

		expect(included.Resources).toEqual([
			{
				schemas: [GROUP_SCHEMA],
				id: group.id,
				members: [{ value: user.id }],
			},
		]);
		expect(excluded.Resources[0]).not.toHaveProperty("displayName");
		expect(excluded.Resources[0]?.members).toEqual([
			expect.objectContaining({ value: user.id }),
		]);
	});

	it("projects Group creation and replacement responses", async () => {
		const { auth, headers } = createFixture();
		const user = await auth.api.createSCIMUser({
			body: {
				schemas: [USER_SCHEMA],
				userName: "ada@example.com",
			},
			headers,
		});
		const created = await auth.api.createSCIMGroup({
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Engineering",
				members: [{ value: user.id }],
			},
			query: { attributes: "displayName" },
			headers,
		});
		const replaced = await auth.api.replaceSCIMGroup({
			params: { groupId: created.id },
			body: {
				schemas: [GROUP_SCHEMA],
				displayName: "Platform Engineering",
				members: [{ value: user.id }],
			},
			query: { excludedAttributes: "members" },
			headers,
		});

		expect(created).toEqual({
			schemas: [GROUP_SCHEMA],
			id: created.id,
			displayName: "Engineering",
		});
		expect(replaced).toMatchObject({
			schemas: [GROUP_SCHEMA],
			id: created.id,
			displayName: "Platform Engineering",
		});
		expect(replaced).not.toHaveProperty("members");
	});

	it("returns projected resources when PATCH requests response attributes", async () => {
		const { auth, headers, user, group } = await createUserAndGroup();
		const requestHeaders = {
			...headers,
			"content-type": "application/scim+json",
		};
		const userResponse = await auth.handler(
			new Request(
				`http://localhost:3000/api/auth/scim/v2/Users/${user.id}?attributes=displayName`,
				{
					method: "PATCH",
					headers: requestHeaders,
					body: JSON.stringify({
						schemas: [PATCH_SCHEMA],
						Operations: [
							{
								op: "replace",
								path: "displayName",
								value: "Augusta Ada King",
							},
						],
					}),
				},
			),
		);
		const groupResponse = await auth.handler(
			new Request(
				`http://localhost:3000/api/auth/scim/v2/Groups/${group.id}?excludedAttributes=members`,
				{
					method: "PATCH",
					headers: requestHeaders,
					body: JSON.stringify({
						schemas: [PATCH_SCHEMA],
						Operations: [
							{
								op: "replace",
								path: "displayName",
								value: "Platform Engineering",
							},
						],
					}),
				},
			),
		);

		expect(userResponse.status).toBe(200);
		expect(userResponse.headers.get("location")).toContain(`/Users/${user.id}`);
		expect(await userResponse.json()).toEqual({
			schemas: [USER_SCHEMA],
			id: user.id,
			displayName: "Augusta Ada King",
		});
		expect(groupResponse.status).toBe(200);
		expect(groupResponse.headers.get("location")).toContain(
			`/Groups/${group.id}`,
		);
		const groupBody = await groupResponse.json();
		expect(groupBody).toMatchObject({
			schemas: [GROUP_SCHEMA],
			id: group.id,
			displayName: "Platform Engineering",
		});
		expect(groupBody).not.toHaveProperty("members");
	});
});
