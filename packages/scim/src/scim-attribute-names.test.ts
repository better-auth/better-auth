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
const SCIM_TOKEN = "attribute-names-token";

interface SCIMResource {
	id: string;
	userName?: string;
	displayName?: string;
	title?: string;
	active?: boolean;
	name?: Record<string, string>;
	emails?: Record<string, unknown>[];
	addresses?: Record<string, unknown>[];
	members?: { value: string }[];
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
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
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

/**
 * @see https://www.rfc-editor.org/rfc/rfc7643#section-2.1
 */
describe("SCIM attribute names are case-insensitive", () => {
	it("applies User attributes sent with different letter case", async () => {
		const { createUser } = createFixture();
		const user = await createUser({
			UserName: "ada@example.com",
			Name: { GivenName: "Ada", FamilyName: "Lovelace" },
			Emails: [{ Value: "ada@example.com", Type: "work", Primary: true }],
			Addresses: [{ Type: "work", Locality: "London" }],
			Title: "Engineer",
			"URN:IETF:PARAMS:SCIM:SCHEMAS:EXTENSION:ENTERPRISE:2.0:USER": {
				Department: "R&D",
				Manager: { Value: "manager-1" },
			},
		});

		expect(user.userName).toBe("ada@example.com");
		expect(user.name).toEqual({
			formatted: "Ada Lovelace",
			givenName: "Ada",
			familyName: "Lovelace",
		});
		expect(user.emails).toEqual([
			{ value: "ada@example.com", type: "work", primary: true },
		]);
		expect(user.addresses).toEqual([{ type: "work", locality: "London" }]);
		expect(user.title).toBe("Engineer");
		expect(user[SCIM_ENTERPRISE_USER_SCHEMA]).toEqual({
			department: "R&D",
			manager: { value: "manager-1" },
		});
	});

	it("deactivates a User through a PUT that sends Active", async () => {
		const { createUser, send } = createFixture();
		const user = await createUser({ userName: "active@example.com" });

		const { status, resource } = await send("PUT", `/Users/${user.id}`, {
			schemas: [SCIM_USER_SCHEMA],
			userName: "active@example.com",
			Active: false,
		});

		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource.active).toBe(false);
	});

	it("rejects Active: null and keys that differ only by letter case", async () => {
		const { createUser, patch, send } = createFixture();
		const user = await createUser({
			userName: "inactive@example.com",
			active: false,
		});

		const nullActive = await send("PUT", `/Users/${user.id}`, {
			schemas: [SCIM_USER_SCHEMA],
			userName: "inactive@example.com",
			Active: null,
		});
		expect(nullActive.status).toBe(400);

		const duplicate = await send("PUT", `/Users/${user.id}`, {
			schemas: [SCIM_USER_SCHEMA],
			userName: "inactive@example.com",
			active: false,
			Active: true,
		});
		expect(duplicate.status).toBe(400);
		expect(duplicate.resource.scimType).toBe("invalidSyntax");

		const duplicatePatch = await patch(`/Users/${user.id}`, [
			{ op: "Replace", value: { title: "Countess", Title: "Engineer" } },
		]);
		expect(duplicatePatch.status).toBe(400);
		expect(duplicatePatch.resource.scimType).toBe("invalidSyntax");

		const { resource } = await send("GET", `/Users/${user.id}`);
		expect(resource.active).toBe(false);
	});

	it("applies PATCH values whose keys use different letter case", async () => {
		const { createUser, patch } = createFixture();
		const user = await createUser({
			userName: "patch@example.com",
			name: { givenName: "Ada", familyName: "Lovelace" },
			addresses: [{ type: "work", locality: "London", country: "GB" }],
		});

		const { status, resource } = await patch(`/Users/${user.id}`, [
			{ op: "Replace", value: { Title: "Countess", Active: false } },
			{
				op: "Replace",
				path: 'addresses[type eq "work"]',
				value: { Country: "FR" },
			},
			{
				op: "Replace",
				path: "emails",
				value: [{ Value: "patch@example.com", Primary: true }],
			},
			{
				op: "Replace",
				path: SCIM_ENTERPRISE_USER_SCHEMA,
				value: { Department: "R&D", Manager: { Value: "manager-1" } },
			},
		]);

		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource.title).toBe("Countess");
		expect(resource.active).toBe(false);
		expect(resource.addresses).toEqual([
			{ type: "work", locality: "London", country: "FR" },
		]);
		expect(resource.emails).toEqual([
			{ value: "patch@example.com", primary: true },
		]);
		expect(resource[SCIM_ENTERPRISE_USER_SCHEMA]).toEqual({
			department: "R&D",
			manager: { value: "manager-1" },
		});
	});

	it("applies Group attributes and members sent with different letter case", async () => {
		const { createUser, patch, send } = createFixture();
		const first = await createUser({ userName: "first@example.com" });
		const second = await createUser({ userName: "second@example.com" });

		const group = await send("POST", "/Groups", {
			schemas: [SCIM_GROUP_SCHEMA],
			DisplayName: "Engineering",
			Members: [{ Value: first.id, Type: "User" }],
		});
		expect(group.status, JSON.stringify(group.resource)).toBe(201);
		expect(group.resource.displayName).toBe("Engineering");
		expect(group.resource.members?.map((member) => member.value)).toEqual([
			first.id,
		]);

		const { status, resource } = await patch(`/Groups/${group.resource.id}`, [
			{ op: "Add", path: "members", value: [{ Value: second.id }] },
		]);
		expect(status, JSON.stringify(resource)).toBe(200);
		expect(resource.members?.map((member) => member.value).sort()).toEqual(
			[first.id, second.id].sort(),
		);
	});
});
