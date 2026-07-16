import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMBearerCredentialOptions } from "./configuration";

const BASE_URL = "http://localhost:3000";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const SCIM_MEDIA_TYPE = "application/scim+json";
const SCIM_USERS_URL = `${BASE_URL}/api/auth/scim/v2/Users`;
const SCIM_GROUPS_URL = `${BASE_URL}/api/auth/scim/v2/Groups`;
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_ENTERPRISE_USER_SCHEMA =
	"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";

interface SCIMUserResponse {
	id: string;
	meta: {
		location: string;
	};
}

interface SCIMErrorResponse {
	schemas: string[];
	status: string;
	detail?: string;
	scimType?: string;
}

function createSCIMAuth(
	credentials: readonly SCIMBearerCredentialOptions[] = [
		{ type: "bearer", id: "active-scim-token", token: "active-scim-token" },
	],
) {
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

	return betterAuth({
		baseURL: BASE_URL,
		database: memoryAdapter(data),
		plugins: [
			scim({
				connections: [{ id: "workforce", credentials }],
			}),
		],
	});
}

function createUserRequest(
	body: unknown,
	contentType = SCIM_MEDIA_TYPE,
	includeSchema = true,
): Request {
	const requestBody =
		includeSchema &&
		typeof body === "object" &&
		body !== null &&
		!Array.isArray(body)
			? { ...body, schemas: [SCIM_USER_SCHEMA] }
			: body;
	return new Request(SCIM_USERS_URL, {
		method: "POST",
		headers: {
			accept: SCIM_MEDIA_TYPE,
			authorization: "Bearer active-scim-token",
			"content-type": contentType,
		},
		body: JSON.stringify(requestBody),
	});
}

async function readJson<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

async function expectSCIMError(
	response: Response,
	status: number,
	scimType?: string,
): Promise<SCIMErrorResponse> {
	expect(response.status).toBe(status);
	expect(response.headers.get("content-type")).toBe(SCIM_MEDIA_TYPE);
	const body = await readJson<SCIMErrorResponse>(response);
	expect(body).toMatchObject({
		schemas: [SCIM_ERROR_SCHEMA],
		status: status.toString(),
		...(scimType ? { scimType } : {}),
	});
	expect(body).not.toHaveProperty("code");
	return body;
}

describe("SCIM HTTP contract", () => {
	it("returns the created User using the SCIM creation response contract", async () => {
		const auth = createSCIMAuth();
		const response = await auth.handler(
			createUserRequest({ userName: "ada@example.com" }),
		);

		expect(response.status).toBe(201);
		expect(response.headers.get("content-type")).toBe(SCIM_MEDIA_TYPE);
		const body = await readJson<SCIMUserResponse>(response);
		expect(response.headers.get("location")).toBe(body.meta.location);
		expect(response.headers.get("content-location")).toBe(body.meta.location);
	});

	it("returns a SCIM uniqueness error for a duplicate User", async () => {
		const auth = createSCIMAuth();
		await auth.handler(createUserRequest({ userName: "ada@example.com" }));

		const duplicate = await auth.handler(
			createUserRequest({ userName: "ada@example.com" }),
		);

		await expectSCIMError(duplicate, 409, "uniqueness");
	});

	it("returns invalidValue for a constrained User attribute", async () => {
		const auth = createSCIMAuth();
		const response = await auth.handler(createUserRequest({ userName: "" }));

		await expectSCIMError(response, 400, "invalidValue");
	});

	it("returns invalidSyntax for malformed JSON before endpoint dispatch", async () => {
		const auth = createSCIMAuth();
		const response = await auth.handler(
			new Request(SCIM_USERS_URL, {
				method: "POST",
				headers: {
					accept: SCIM_MEDIA_TYPE,
					authorization: "Bearer active-scim-token",
					"content-type": SCIM_MEDIA_TYPE,
				},
				body: '{"schemas":',
			}),
		);

		await expectSCIMError(response, 400, "invalidSyntax");
	});

	it("rejects a User resource without its core schema", async () => {
		const auth = createSCIMAuth();
		const response = await auth.handler(
			createUserRequest(
				{ userName: "missing-schema@example.com" },
				undefined,
				false,
			),
		);

		await expectSCIMError(response, 400, "invalidValue");
	});

	it("rejects an unsupported User extension schema", async () => {
		const auth = createSCIMAuth();
		const response = await auth.handler(
			new Request(SCIM_USERS_URL, {
				method: "POST",
				headers: {
					accept: SCIM_MEDIA_TYPE,
					authorization: "Bearer active-scim-token",
					"content-type": SCIM_MEDIA_TYPE,
				},
				body: JSON.stringify({
					schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
					userName: "enterprise@example.com",
					[SCIM_ENTERPRISE_USER_SCHEMA]: { employeeNumber: "42" },
				}),
			}),
		);

		await expectSCIMError(response, 400, "invalidValue");
	});

	it("rejects duplicate User schema URNs", async () => {
		const auth = createSCIMAuth();
		const response = await auth.handler(
			new Request(SCIM_USERS_URL, {
				method: "POST",
				headers: {
					accept: SCIM_MEDIA_TYPE,
					authorization: "Bearer active-scim-token",
					"content-type": SCIM_MEDIA_TYPE,
				},
				body: JSON.stringify({
					schemas: [SCIM_USER_SCHEMA, SCIM_USER_SCHEMA],
					userName: "duplicate-schema@example.com",
				}),
			}),
		);

		await expectSCIMError(response, 400, "invalidValue");
	});

	it("rejects an unsupported Group extension schema", async () => {
		const auth = createSCIMAuth();
		const unsupportedGroupSchema =
			"urn:example:params:scim:schemas:extension:2.0:Group";
		const response = await auth.handler(
			new Request(SCIM_GROUPS_URL, {
				method: "POST",
				headers: {
					accept: SCIM_MEDIA_TYPE,
					authorization: "Bearer active-scim-token",
					"content-type": SCIM_MEDIA_TYPE,
				},
				body: JSON.stringify({
					schemas: [SCIM_GROUP_SCHEMA, unsupportedGroupSchema],
					displayName: "Engineering",
					[unsupportedGroupSchema]: { code: "engineering" },
				}),
			}),
		);

		await expectSCIMError(response, 400, "invalidValue");
	});

	it("returns noTarget for a pathless Group remove", async () => {
		const auth = createSCIMAuth();
		const headers = { authorization: "Bearer active-scim-token" };
		const group = await auth.api.createSCIMGroup({
			body: {
				schemas: [SCIM_GROUP_SCHEMA],
				displayName: "Engineering",
			},
			headers,
		});
		const response = await auth.handler(
			new Request(
				`${BASE_URL}/api/auth/scim/v2/Groups/${encodeURIComponent(group.id)}`,
				{
					method: "PATCH",
					headers: {
						...headers,
						"content-type": SCIM_MEDIA_TYPE,
					},
					body: JSON.stringify({
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [{ op: "remove" }],
					}),
				},
			),
		);

		await expectSCIMError(response, 400, "noTarget");
	});

	it("returns a SCIM error for an unsupported request media type", async () => {
		const auth = createSCIMAuth();
		const response = await auth.handler(
			createUserRequest({ userName: "ada@example.com" }, "text/plain"),
		);

		await expectSCIMError(response, 415);
	});

	it.each([
		["missing", undefined],
		["expired", "Bearer expired-scim-token"],
	] as const)("returns a challenged SCIM error for %s authentication", async (_kind, authorization) => {
		const auth = createSCIMAuth([
			{ type: "bearer", id: "active-scim-token", token: "active-scim-token" },
			{
				type: "bearer",
				id: "expired-scim-token",
				token: "expired-scim-token",
				expiresAt: new Date(Date.now() - 60_000),
			},
		]);
		const headers = new Headers({ accept: SCIM_MEDIA_TYPE });
		if (authorization) headers.set("authorization", authorization);
		const response = await auth.handler(
			new Request(SCIM_USERS_URL, { headers }),
		);

		await expectSCIMError(response, 401);
		expect(response.headers.get("www-authenticate")).toBe(
			'Bearer realm="SCIM"',
		);
	});
});
