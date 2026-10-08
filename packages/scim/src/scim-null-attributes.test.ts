import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMUser } from "./persistence";

const BASE_URL = "http://localhost:3000";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_ENTERPRISE_USER_SCHEMA =
	"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_MEDIA_TYPE = "application/scim+json";
const SCIM_TOKEN = "null-attributes-token";

interface SCIMResource {
	id: string;
	userName?: string;
	displayName?: string;
	externalId?: string;
	title?: string;
	active?: boolean;
	name?: Record<string, string>;
	emails?: Record<string, unknown>[];
	addresses?: Record<string, unknown>[];
	members?: { value: string }[];
	detail?: string;
	scimType?: string;
	[SCIM_ENTERPRISE_USER_SCHEMA]?: Record<string, unknown>;
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
		scimUser: [] as SCIMUser[],
		scimGroup: [] as { id: string }[],
		scimGroupMember: [] as { id: string }[],
		scimProjectionGrant: [] as { id: string }[],
	};
	const auth = betterAuth({
		baseURL: BASE_URL,
		database: memoryAdapter(data),
		plugins: [
			scim({
				connections: [
					{
						id: "workforce",
						credentials: [
							{ type: "bearer", id: SCIM_TOKEN, token: SCIM_TOKEN },
						],
					},
				],
				identity: {
					resolveUser() {
						return { action: "create" };
					},
				},
			}),
		],
	});

	async function send(
		method: "GET" | "PATCH" | "POST" | "PUT",
		path: string,
		body?: unknown,
	): Promise<{ status: number; resource: SCIMResource }> {
		const headers = new Headers({
			accept: SCIM_MEDIA_TYPE,
			authorization: `Bearer ${SCIM_TOKEN}`,
		});
		if (body !== undefined) headers.set("content-type", SCIM_MEDIA_TYPE);
		const response = await auth.handler(
			new Request(`${BASE_URL}/api/auth/scim/v2${path}`, {
				method,
				headers,
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			}),
		);
		return {
			status: response.status,
			resource: (await response.json()) as SCIMResource,
		};
	}

	async function createUser(body: Record<string, unknown>) {
		const { status, resource } = await send("POST", "/Users", {
			schemas: [SCIM_USER_SCHEMA],
			...body,
		});
		expect(status, JSON.stringify(resource)).toBe(201);
		return resource;
	}

	function patch(resourcePath: string, operations: unknown[]) {
		return send("PATCH", resourcePath, {
			schemas: [SCIM_PATCH_SCHEMA],
			Operations: operations,
		});
	}

	return { send, createUser, patch };
}

const fullUser = {
	schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
	userName: "ada@example.com",
	externalId: "ada",
	title: "Engineer",
	name: {
		formatted: "Ada Lovelace",
		givenName: "Ada",
		familyName: "Lovelace",
		middleName: "Countess",
	},
	emails: [{ value: "ada@example.com", type: "work", primary: true }],
	addresses: [{ type: "work", streetAddress: "1 Main St", locality: "London" }],
	[SCIM_ENTERPRISE_USER_SCHEMA]: {
		department: "R&D",
		manager: { value: "manager-1", displayName: "Charles" },
	},
};

/**
 * @see https://github.com/better-auth/better-auth/issues/11015
 * @see https://www.rfc-editor.org/rfc/rfc7643#section-2.5
 */
describe("SCIM null attributes on create and replace", () => {
	/**
	 * @see https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups
	 */
	it("provisions Microsoft Entra's documented create request with top-level null attributes", async () => {
		const { createUser } = createFixture();
		const user = await createUser({
			externalId: "jyoung",
			userName: "jyoung@testuser.com",
			active: true,
			addresses: null,
			displayName: "Joy Young",
			emails: [{ type: "work", value: "jyoung@contoso.com", primary: true }],
			meta: { resourceType: "User" },
			name: { familyName: "Young", givenName: "Joy" },
			phoneNumbers: null,
			preferredLanguage: null,
			title: null,
		});

		expect(user.userName).toBe("jyoung@testuser.com");
		expect(user.displayName).toBe("Joy Young");
		expect(user).not.toHaveProperty("title");
		expect(user).not.toHaveProperty("addresses");
	});

	it("treats null sub-attributes as unassigned", async () => {
		const { createUser } = createFixture();
		const user = await createUser({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			userName: "member@example.com",
			name: { givenName: "Ada", familyName: "Lovelace", middleName: null },
			emails: [{ value: "member@example.com", type: null, primary: null }],
			addresses: [
				{
					type: "work",
					streetAddress: "44 Montgomery St",
					formatted: null,
					country: null,
				},
			],
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				department: null,
				manager: { value: "manager-1", $ref: null, displayName: null },
			},
		});

		expect(user.name).not.toHaveProperty("middleName");
		expect(user.emails).toEqual([
			{ value: "member@example.com", primary: true },
		]);
		expect(user.addresses).toEqual([
			{ type: "work", streetAddress: "44 Montgomery St" },
		]);
		expect(user[SCIM_ENTERPRISE_USER_SCHEMA]).toEqual({
			manager: { value: "manager-1" },
		});
	});

	it("clears attributes a PUT sends as null", async () => {
		const { createUser, send } = createFixture();
		const user = await createUser(fullUser);

		const { status, resource } = await send("PUT", `/Users/${user.id}`, {
			...fullUser,
			title: null,
			name: { ...fullUser.name, middleName: null },
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				department: null,
				manager: { value: null, $ref: null },
			},
		});

		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource).not.toHaveProperty("title");
		expect(resource.name).not.toHaveProperty("middleName");
		expect(resource).not.toHaveProperty(SCIM_ENTERPRISE_USER_SCHEMA);
	});

	it("still rejects a null active value", async () => {
		const { createUser, send } = createFixture();
		const post = await send("POST", "/Users", {
			schemas: [SCIM_USER_SCHEMA],
			userName: "inactive@example.com",
			active: null,
		});
		expect(post.status).toBe(400);

		const user = await createUser({
			userName: "inactive@example.com",
			active: false,
		});
		const put = await send("PUT", `/Users/${user.id}`, {
			schemas: [SCIM_USER_SCHEMA],
			userName: "inactive@example.com",
			active: null,
		});
		expect(put.status).toBe(400);
		expect((await send("GET", `/Users/${user.id}`)).resource.active).toBe(
			false,
		);
	});

	it("rejects null required attributes and null array entries", async () => {
		const { send } = createFixture();
		for (const [path, body] of [
			["/Users", { schemas: [SCIM_USER_SCHEMA], userName: null }],
			[
				"/Users",
				{
					schemas: [SCIM_USER_SCHEMA],
					userName: "entries@example.com",
					emails: [null],
				},
			],
			["/Groups", { schemas: [SCIM_GROUP_SCHEMA], displayName: null }],
		] as const) {
			const { status } = await send("POST", path, body);
			expect(status, JSON.stringify(body)).toBe(400);
		}
	});

	it("treats null Group attributes as unassigned", async () => {
		const { createUser, send } = createFixture();
		const user = await createUser({ userName: "member@example.com" });

		const created = await send("POST", "/Groups", {
			schemas: [SCIM_GROUP_SCHEMA],
			displayName: "Engineering",
			externalId: null,
			members: [{ value: user.id, display: null }],
		});
		expect(created.status, JSON.stringify(created.resource)).toBe(201);
		expect(created.resource).not.toHaveProperty("externalId");
		expect(created.resource.members?.map((member) => member.value)).toEqual([
			user.id,
		]);

		const replaced = await send("PUT", `/Groups/${created.resource.id}`, {
			schemas: [SCIM_GROUP_SCHEMA],
			displayName: "Engineering",
			members: null,
		});
		expect(replaced.status, JSON.stringify(replaced.resource)).toBe(200);
		expect(replaced.resource.members ?? []).toEqual([]);
	});
});

/**
 * @see https://www.rfc-editor.org/rfc/rfc7643#section-2.5
 * @see https://www.rfc-editor.org/rfc/rfc7644#section-3.5.2.3
 */
describe("SCIM PATCH null values", () => {
	it("clears single-valued attributes a replace or add sets to null", async () => {
		const { createUser, patch } = createFixture();
		const user = await createUser(fullUser);

		const { status, resource } = await patch(`/Users/${user.id}`, [
			{ op: "Replace", path: "title", value: null },
			{ op: "Add", path: "externalId", value: null },
			{
				op: "Replace",
				path: `${SCIM_ENTERPRISE_USER_SCHEMA}:department`,
				value: null,
			},
		]);

		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource).not.toHaveProperty("title");
		expect(resource).not.toHaveProperty("externalId");
		expect(resource[SCIM_ENTERPRISE_USER_SCHEMA]).not.toHaveProperty(
			"department",
		);
	});

	it("clears the null sub-attributes of a complex value and applies the rest", async () => {
		const { createUser, patch } = createFixture();
		const user = await createUser(fullUser);

		const { status, resource } = await patch(`/Users/${user.id}`, [
			{
				op: "Replace",
				path: "name",
				value: { familyName: "King", middleName: null, formatted: null },
			},
			{
				op: "Replace",
				path: `${SCIM_ENTERPRISE_USER_SCHEMA}:manager`,
				value: { displayName: null },
			},
		]);

		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource.name).toEqual({
			formatted: "Ada King",
			givenName: "Ada",
			familyName: "King",
		});
		expect(resource[SCIM_ENTERPRISE_USER_SCHEMA]).toEqual({
			department: "R&D",
			manager: { value: "manager-1" },
		});
	});

	it("clears null attributes in a pathless replace", async () => {
		const { createUser, patch } = createFixture();
		const user = await createUser(fullUser);

		const { status, resource } = await patch(`/Users/${user.id}`, [
			{
				op: "Replace",
				value: {
					title: null,
					"name.middleName": null,
					displayName: "Ada L",
					[SCIM_ENTERPRISE_USER_SCHEMA]: { department: null, manager: null },
				},
			},
		]);

		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource.displayName).toBe("Ada L");
		expect(resource).not.toHaveProperty("title");
		expect(resource.name).not.toHaveProperty("middleName");
		expect(resource).not.toHaveProperty(SCIM_ENTERPRISE_USER_SCHEMA);
	});

	it("clears null sub-attributes of selected and replaced multi-valued entries", async () => {
		const { createUser, patch } = createFixture();
		const user = await createUser({
			...fullUser,
			addresses: [
				{ type: "work", streetAddress: "1 Main St", country: "GB" },
				{ type: "home", locality: "Bath", region: "Somerset" },
			],
		});

		const { status, resource } = await patch(`/Users/${user.id}`, [
			{ op: "Replace", path: 'addresses[type eq "work"].country', value: null },
			{
				op: "Replace",
				path: 'addresses[type eq "home"]',
				value: { locality: "Bristol", region: null },
			},
			{
				op: "Replace",
				path: "emails",
				value: [{ value: "ada@example.com", type: null, primary: null }],
			},
		]);

		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource.addresses).toEqual([
			{ type: "work", streetAddress: "1 Main St" },
			{ type: "home", locality: "Bristol" },
		]);
		expect(resource.emails).toEqual([
			{ value: "ada@example.com", primary: true },
		]);
	});

	it("rejects null for active and required attributes without applying the PATCH", async () => {
		const { createUser, patch, send } = createFixture();
		const user = await createUser({ ...fullUser, active: false });

		for (const operations of [
			[{ op: "Replace", path: "active", value: null }],
			[{ op: "Replace", value: { title: null, active: null } }],
			[{ op: "Replace", path: "userName", value: null }],
			[{ op: "Replace", path: "emails", value: null }],
		]) {
			const { status } = await patch(`/Users/${user.id}`, operations);
			expect(status, JSON.stringify(operations)).toBe(400);
		}

		const { resource } = await send("GET", `/Users/${user.id}`);
		expect(resource.active).toBe(false);
		expect(resource.title).toBe("Engineer");
	});

	it("clears Group attributes a PATCH sets to null", async () => {
		const { createUser, patch, send } = createFixture();
		const user = await createUser({ userName: "member@example.com" });
		const group = await send("POST", "/Groups", {
			schemas: [SCIM_GROUP_SCHEMA],
			displayName: "Engineering",
			externalId: "eng",
			members: [{ value: user.id }],
		});
		expect(group.status).toBe(201);

		const { status, resource } = await patch(`/Groups/${group.resource.id}`, [
			{ op: "Replace", value: { externalId: null } },
			{ op: "Replace", path: "members", value: null },
		]);
		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource).not.toHaveProperty("externalId");
		expect(resource.members ?? []).toEqual([]);

		const rejected = await patch(`/Groups/${group.resource.id}`, [
			{ op: "Replace", path: "displayName", value: null },
		]);
		expect(rejected.status).toBe(400);
	});

	it("clears a filtered entry's null sub-attributes when the update also changes its selector", async () => {
		const { createUser, patch } = createFixture();
		const user = await createUser({
			...fullUser,
			addresses: [{ type: "work", locality: "London", country: "GB" }],
		});

		const { status, resource } = await patch(`/Users/${user.id}`, [
			{
				op: "Replace",
				path: 'addresses[type eq "work"]',
				value: { type: "home", country: null },
			},
		]);

		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource.addresses).toEqual([{ type: "home", locality: "London" }]);
	});

	it("clears null sub-attributes of single-element array values", async () => {
		const { createUser, patch } = createFixture();
		const user = await createUser({
			...fullUser,
			addresses: [{ type: "work", locality: "London", country: "GB" }],
		});

		const { status, resource } = await patch(`/Users/${user.id}`, [
			{
				op: "Replace",
				path: 'addresses[type eq "work"]',
				value: [{ locality: "Bristol", country: null }],
			},
			{
				op: "Replace",
				path: `${SCIM_ENTERPRISE_USER_SCHEMA}:manager`,
				value: [{ value: "manager-2", displayName: null }],
			},
		]);

		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource.addresses).toEqual([{ type: "work", locality: "Bristol" }]);
		expect(resource[SCIM_ENTERPRISE_USER_SCHEMA]?.manager).toEqual({
			value: "manager-2",
		});
	});

	it("clears Enterprise attributes through the enterprise path alias", async () => {
		const { createUser, patch } = createFixture();
		const user = await createUser(fullUser);

		const { status, resource } = await patch(`/Users/${user.id}`, [
			{ op: "Replace", path: "enterprise", value: { department: null } },
		]);

		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource[SCIM_ENTERPRISE_USER_SCHEMA]).toEqual({
			manager: { value: "manager-1" },
		});
	});

	it("ignores null read-only attributes in a pathless Group PATCH", async () => {
		const { patch, send } = createFixture();
		const group = await send("POST", "/Groups", {
			schemas: [SCIM_GROUP_SCHEMA],
			displayName: "Engineering",
		});
		expect(group.status).toBe(201);

		const { status, resource } = await patch(`/Groups/${group.resource.id}`, [
			{
				op: "Replace",
				value: { schemas: null, meta: null, displayName: "Platform" },
			},
		]);

		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource.displayName).toBe("Platform");
	});
});
