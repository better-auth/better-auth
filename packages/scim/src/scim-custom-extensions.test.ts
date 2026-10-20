import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const BASE_URL = "http://localhost:3000";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const ACME_URN = "urn:ietf:params:scim:schemas:extension:acme:2.0:User";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_MEDIA_TYPE = "application/scim+json";

interface PersistedUser extends User {
	sapUserId?: string | null;
}

function createFixture() {
	const data = {
		user: [] as PersistedUser[],
		session: [] as { id: string }[],
		verification: [] as { id: string }[],
		account: [] as { id: string }[],
		scimConnectionBinding: [] as { id: string }[],
		scimIdentityTombstone: [] as { id: string }[],
		scimSubject: [] as { id: string; userId: string }[],
		scimUser: [] as { id: string; serializedAttributes: string }[],
		scimGroup: [] as { id: string }[],
		scimGroupMember: [] as { id: string }[],
		scimProjectionGrant: [] as { id: string }[],
	};
	const auth = betterAuth({
		baseURL: BASE_URL,
		database: memoryAdapter(data),
		user: {
			additionalFields: {
				// Mapped from the custom extension; server-set only.
				sapUserId: { type: "string", required: false, input: false },
			},
		},
		plugins: [
			scim({
				connections: [
					{
						id: "workforce",
						credentials: [
							{ type: "bearer", id: "token", token: "workforce-token" },
						],
					},
				],
				userSchemaExtensions: [
					{
						urn: ACME_URN,
						name: "AcmeUser",
						attributes: [
							{ name: "sapUserId", type: "string", mapTo: "sapUserId" },
							{ name: "costCenter", type: "string" },
						],
					},
				],
			}),
		],
	});
	return { auth, data };
}

function scimRequest(
	path: string,
	options: {
		method?: "GET" | "PATCH" | "POST" | "PUT";
		body?: unknown;
	} = {},
): Request {
	const headers = new Headers({
		accept: SCIM_MEDIA_TYPE,
		authorization: "Bearer workforce-token",
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

interface CustomUserResponse {
	id: string;
	schemas: string[];
	userName: string;
	[ACME_URN]?: { sapUserId?: string; costCenter?: string };
}

const createBody = {
	schemas: [SCIM_USER_SCHEMA, ACME_URN],
	userName: "bjensen@example.com",
	emails: [{ value: "bjensen@example.com", type: "work", primary: true }],
	[ACME_URN]: { sapUserId: "E-42", costCenter: "CC-9" },
};

/**
 * @see https://github.com/better-auth/better-auth/issues/10980
 */
describe("SCIM custom User schema extensions", () => {
	it("round-trips a declared custom extension and maps it onto the user", async () => {
		const { auth, data } = createFixture();

		const createResponse = await auth.handler(
			scimRequest("/scim/v2/Users", { method: "POST", body: createBody }),
		);
		expect(createResponse.status).toBe(201);
		const created = await readJSON<CustomUserResponse>(createResponse);
		expect(created.schemas).toContain(ACME_URN);
		expect(created[ACME_URN]).toEqual({
			sapUserId: "E-42",
			costCenter: "CC-9",
		});

		// Mapped attribute lands on the Better Auth user and is queryable.
		expect(data.user).toHaveLength(1);
		expect(data.user[0]?.sapUserId).toBe("E-42");

		// GET returns the same custom payload.
		const getResponse = await auth.handler(
			scimRequest(`/scim/v2/Users/${created.id}`),
		);
		const fetched = await readJSON<CustomUserResponse>(getResponse);
		expect(fetched[ACME_URN]).toEqual({
			sapUserId: "E-42",
			costCenter: "CC-9",
		});
	});

	it("rejects an attribute that is not declared on the extension", async () => {
		const { auth } = createFixture();

		const response = await auth.handler(
			scimRequest("/scim/v2/Users", {
				method: "POST",
				body: {
					...createBody,
					[ACME_URN]: { sapUserId: "E-1", notDeclared: "x" },
				},
			}),
		);
		expect(response.status).toBe(400);
	});

	it("rejects an undeclared extension schema URN", async () => {
		const { auth } = createFixture();

		const response = await auth.handler(
			scimRequest("/scim/v2/Users", {
				method: "POST",
				body: {
					schemas: [
						SCIM_USER_SCHEMA,
						"urn:unknown:params:scim:schemas:extension:2.0:User",
					],
					userName: "other@example.com",
					emails: [{ value: "other@example.com", primary: true }],
				},
			}),
		);
		expect(response.status).toBe(400);
	});

	it("replaces mapped and unmapped custom attributes on PUT", async () => {
		const { auth, data } = createFixture();
		const created = await readJSON<CustomUserResponse>(
			await auth.handler(
				scimRequest("/scim/v2/Users", { method: "POST", body: createBody }),
			),
		);

		const putResponse = await auth.handler(
			scimRequest(`/scim/v2/Users/${created.id}`, {
				method: "PUT",
				body: {
					...createBody,
					[ACME_URN]: { sapUserId: "E-999", costCenter: "CC-1" },
				},
			}),
		);
		expect(putResponse.status).toBe(200);
		const replaced = await readJSON<CustomUserResponse>(putResponse);
		expect(replaced[ACME_URN]).toEqual({
			sapUserId: "E-999",
			costCenter: "CC-1",
		});
		expect(data.user[0]?.sapUserId).toBe("E-999");
	});

	it("retains stored custom attributes across an unrelated PATCH", async () => {
		const { auth, data } = createFixture();
		const created = await readJSON<CustomUserResponse>(
			await auth.handler(
				scimRequest("/scim/v2/Users", { method: "POST", body: createBody }),
			),
		);

		const patchResponse = await auth.handler(
			scimRequest(`/scim/v2/Users/${created.id}`, {
				method: "PATCH",
				body: {
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{ op: "replace", path: "displayName", value: "New Name" },
					],
				},
			}),
		);
		expect(patchResponse.status).toBe(200);
		const patched = await readJSON<CustomUserResponse>(patchResponse);
		expect(patched[ACME_URN]).toEqual({
			sapUserId: "E-42",
			costCenter: "CC-9",
		});
		expect(data.user[0]?.sapUserId).toBe("E-42");
	});

	it("replaces a custom attribute by its schema-qualified PATCH path", async () => {
		const { auth, data } = createFixture();
		const created = await readJSON<CustomUserResponse>(
			await auth.handler(
				scimRequest("/scim/v2/Users", { method: "POST", body: createBody }),
			),
		);

		const patchResponse = await auth.handler(
			scimRequest(`/scim/v2/Users/${created.id}`, {
				method: "PATCH",
				body: {
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{ op: "replace", path: `${ACME_URN}:sapUserId`, value: "E-77" },
					],
				},
			}),
		);
		expect(patchResponse.status).toBe(200);
		const patched = await readJSON<CustomUserResponse>(patchResponse);
		expect(patched[ACME_URN]).toEqual({
			sapUserId: "E-77",
			costCenter: "CC-9",
		});
		expect(data.user[0]?.sapUserId).toBe("E-77");
	});

	it("removes a custom attribute by its schema-qualified PATCH path", async () => {
		const { auth, data } = createFixture();
		const created = await readJSON<CustomUserResponse>(
			await auth.handler(
				scimRequest("/scim/v2/Users", { method: "POST", body: createBody }),
			),
		);

		const patchResponse = await auth.handler(
			scimRequest(`/scim/v2/Users/${created.id}`, {
				method: "PATCH",
				body: {
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [{ op: "remove", path: `${ACME_URN}:sapUserId` }],
				},
			}),
		);
		expect(patchResponse.status).toBe(200);
		const patched = await readJSON<CustomUserResponse>(patchResponse);
		expect(patched[ACME_URN]).toEqual({ costCenter: "CC-9" });
		expect(data.user[0]?.sapUserId ?? null).toBeNull();
	});

	// Microsoft Entra and other providers sometimes send a custom extension's
	// value object without listing its URN in `schemas`. The value must still be
	// accepted and the URN auto-declared, rather than returning 400.
	it("accepts a custom extension value when its URN is omitted from schemas", async () => {
		const { auth, data } = createFixture();

		const response = await auth.handler(
			scimRequest("/scim/v2/Users", {
				method: "POST",
				body: {
					schemas: [SCIM_USER_SCHEMA],
					userName: "bjensen@example.com",
					emails: [
						{ value: "bjensen@example.com", type: "work", primary: true },
					],
					[ACME_URN]: { sapUserId: "E-42", costCenter: "CC-9" },
				},
			}),
		);
		expect(response.status).toBe(201);
		const created = await readJSON<CustomUserResponse>(response);
		expect(created.schemas).toContain(ACME_URN);
		expect(created[ACME_URN]).toEqual({ sapUserId: "E-42", costCenter: "CC-9" });
		expect(data.user[0]?.sapUserId).toBe("E-42");
	});
});

function createAuthWithMapping(options: {
	additionalFields?: Record<
		string,
		{
			type: "string" | "number" | "boolean" | "date";
			required?: boolean;
			input?: boolean;
		}
	>;
	warn?: (message: string) => void;
}) {
	const data: Record<string, unknown[]> = {
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
	return betterAuth({
		baseURL: BASE_URL,
		database: memoryAdapter(data),
		...(options.additionalFields
			? { user: { additionalFields: options.additionalFields } }
			: {}),
		...(options.warn
			? {
					logger: {
						log: (level: string, message: string) => {
							if (level === "warn") options.warn?.(message);
						},
					},
				}
			: {}),
		plugins: [
			scim({
				connections: [
					{
						id: "workforce",
						credentials: [
							{ type: "bearer", id: "token", token: "workforce-token" },
						],
					},
				],
				userSchemaExtensions: [
					{
						urn: ACME_URN,
						name: "AcmeUser",
						attributes: [
							{ name: "sapUserId", type: "string", mapTo: "sapUserId" },
						],
					},
				],
			}),
		],
	});
}

describe("SCIM custom extension startup validation", () => {
	it("fails when a mapped user field is not declared", async () => {
		const auth = createAuthWithMapping({});
		await expect(auth.$context).rejects.toThrow(
			/not declared on the user model/,
		);
	});

	it("fails when a mapped user field is required", async () => {
		const auth = createAuthWithMapping({
			additionalFields: {
				sapUserId: { type: "string", required: true, input: false },
			},
		});
		await expect(auth.$context).rejects.toThrow(/must be optional/);
	});

	it("fails when a mapped user field has an incompatible type", async () => {
		const auth = createAuthWithMapping({
			additionalFields: {
				sapUserId: { type: "number", required: false, input: false },
			},
		});
		await expect(auth.$context).rejects.toThrow(/requires "string"/);
	});

	it("warns when a mapped user field is end-user writable", async () => {
		const warnings: string[] = [];
		const auth = createAuthWithMapping({
			additionalFields: {
				sapUserId: { type: "string", required: false },
			},
			warn: (message) => warnings.push(message),
		});
		await auth.$context;
		expect(warnings.some((message) => message.includes("input: false"))).toBe(
			true,
		);
	});
});
