import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMUser } from "./persistence";

const BASE_URL = "http://localhost:3000";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_MEDIA_TYPE = "application/scim+json";
const SCIM_TOKEN = "entra-token";

interface SCIMMultiValue {
	value: string;
	display?: string;
	type?: string;
	primary?: boolean;
}

interface SCIMAddress {
	formatted?: string;
	streetAddress?: string;
	locality?: string;
	region?: string;
	postalCode?: string;
	country?: string;
	type?: string;
	primary?: boolean;
}

interface SCIMUserResponse {
	schemas: string[];
	id: string;
	userName: string;
	name: {
		formatted: string;
		givenName?: string;
		familyName?: string;
	};
	emails?: SCIMMultiValue[];
	phoneNumbers?: SCIMMultiValue[];
	addresses?: SCIMAddress[];
	roles?: SCIMMultiValue[];
	entitlements?: SCIMMultiValue[];
}

function createEntraFixture() {
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
	return { auth, data };
}

function createSCIMRequest(
	path: string,
	options: {
		method?: "GET" | "PATCH" | "POST";
		body?: unknown;
	} = {},
): Request {
	const headers = new Headers({
		accept: SCIM_MEDIA_TYPE,
		authorization: `Bearer ${SCIM_TOKEN}`,
	});
	if (options.body !== undefined) {
		headers.set("content-type", SCIM_MEDIA_TYPE);
	}
	return new Request(`${BASE_URL}/api/auth${path}`, {
		method: options.method ?? "GET",
		headers,
		...(options.body === undefined
			? {}
			: { body: JSON.stringify(options.body) }),
	});
}

async function readJSON<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

async function createUser(
	auth: ReturnType<typeof createEntraFixture>["auth"],
	body: Record<string, unknown>,
): Promise<SCIMUserResponse> {
	const response = await auth.handler(
		createSCIMRequest("/scim/v2/Users", {
			method: "POST",
			body: { schemas: [SCIM_USER_SCHEMA], ...body },
		}),
	);
	const created = await readJSON<SCIMUserResponse>(response);
	expect(response.status, JSON.stringify(created)).toBe(201);
	return created;
}

async function patchUser(
	auth: ReturnType<typeof createEntraFixture>["auth"],
	userId: string,
	operations: unknown[],
): Promise<Response> {
	return auth.handler(
		createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(userId)}`, {
			method: "PATCH",
			body: { schemas: [SCIM_PATCH_SCHEMA], Operations: operations },
		}),
	);
}

describe("SCIM User PATCH against Microsoft Entra ID attribute mappings", () => {
	it("creates a filtered phone number and keeps the operations bundled with it", async () => {
		const { auth } = createEntraFixture();
		const user = await createUser(auth, {
			userName: "bundled-phone@example.com",
			name: { givenName: "Ada", familyName: "Lovelace" },
		});

		const response = await patchUser(auth, user.id, [
			{
				op: "Replace",
				path: 'phoneNumbers[type eq "work"].value',
				value: "+1-555-0100",
			},
			{ op: "Replace", path: "name.familyName", value: "King" },
		]);
		const patched = await readJSON<SCIMUserResponse>(response);
		expect(response.status, JSON.stringify(patched)).toBe(200);
		expect(patched.phoneNumbers).toEqual([
			{ value: "+1-555-0100", type: "work" },
		]);
		expect(patched.name.familyName).toBe("King");
	});

	it("creates a filtered address sub-attribute", async () => {
		const { auth } = createEntraFixture();
		const user = await createUser(auth, {
			userName: "missing-address@example.com",
		});

		const response = await patchUser(auth, user.id, [
			{
				op: "Replace",
				path: 'addresses[type eq "work"].postalCode',
				value: "94105",
			},
		]);
		const patched = await readJSON<SCIMUserResponse>(response);
		expect(response.status, JSON.stringify(patched)).toBe(200);
		expect(patched.addresses).toEqual([{ type: "work", postalCode: "94105" }]);
	});

	it("creates filtered roles and entitlements", async () => {
		const { auth } = createEntraFixture();
		const user = await createUser(auth, {
			userName: "missing-role@example.com",
		});

		const response = await patchUser(auth, user.id, [
			{
				op: "Replace",
				path: 'roles[type eq "work"].value',
				value: "engineer",
			},
			{
				op: "Replace",
				path: 'entitlements[type eq "work"].value',
				value: "vpn",
			},
		]);
		const patched = await readJSON<SCIMUserResponse>(response);
		expect(response.status, JSON.stringify(patched)).toBe(200);
		expect(patched.roles).toEqual([{ value: "engineer", type: "work" }]);
		expect(patched.entitlements).toEqual([{ value: "vpn", type: "work" }]);
	});

	it("creates a filtered email without moving the primary address", async () => {
		const { auth } = createEntraFixture();
		const user = await createUser(auth, {
			userName: "primary-email@example.com",
			emails: [
				{ value: "primary-email@example.com", type: "work", primary: true },
			],
		});

		const response = await patchUser(auth, user.id, [
			{
				op: "Replace",
				path: 'emails[type eq "other"].value',
				value: "other-email@example.com",
			},
		]);
		const patched = await readJSON<SCIMUserResponse>(response);
		expect(response.status, JSON.stringify(patched)).toBe(200);
		expect(patched.emails).toEqual([
			{ value: "primary-email@example.com", type: "work", primary: true },
			{ value: "other-email@example.com", type: "other", primary: false },
		]);
	});

	it("creates a single primary value for a quoted primary filter", async () => {
		const { auth } = createEntraFixture();
		const user = await createUser(auth, {
			userName: "quoted-primary@example.com",
			roles: [{ value: "engineer", primary: false }],
		});

		const response = await patchUser(auth, user.id, [
			{
				op: "Replace",
				path: 'roles[primary eq "true"].value',
				value: "senior-engineer",
			},
		]);
		const patched = await readJSON<SCIMUserResponse>(response);
		expect(response.status, JSON.stringify(patched)).toBe(200);
		expect(patched.roles).toEqual([
			{ value: "engineer", primary: false },
			{ value: "senior-engineer", primary: true },
		]);
		expect(patched.roles?.filter((role) => role.primary)).toHaveLength(1);
	});

	it("updates a populated filtered phone number in place", async () => {
		const { auth } = createEntraFixture();
		const user = await createUser(auth, {
			userName: "populated-phone@example.com",
			phoneNumbers: [{ value: "+1-555-0100", type: "work" }],
		});

		const response = await patchUser(auth, user.id, [
			{
				op: "Replace",
				path: 'phoneNumbers[type eq "work"].value',
				value: "+1-555-0199",
			},
		]);
		const patched = await readJSON<SCIMUserResponse>(response);
		expect(response.status, JSON.stringify(patched)).toBe(200);
		expect(patched.phoneNumbers).toEqual([
			{ value: "+1-555-0199", type: "work" },
		]);
	});

	it("rejects a remove operation without a path", async () => {
		const { auth } = createEntraFixture();
		const user = await createUser(auth, {
			userName: "pathless-remove@example.com",
		});

		const response = await patchUser(auth, user.id, [
			{ op: "Remove", value: { displayName: "Ada" } },
		]);
		const error = await readJSON<{ scimType?: string }>(response);
		expect(response.status, JSON.stringify(error)).toBe(400);
		expect(error.scimType).toBe("noTarget");
	});
});
