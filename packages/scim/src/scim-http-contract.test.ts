import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMBearerCredentialOptions, SCIMOptions } from "./configuration";

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
const SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA =
	"http://schemas.microsoft.com/2006/11/ResourceManagement/ADSCIM/2.0/Group";
const SCIM_MICROSOFT_GRAPH_GROUP_SCHEMA =
	"urn:ietf:params:scim:schemas:extension:Microsoft:Entra:2.0:Group";

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
	compatibility?: SCIMOptions["compatibility"],
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
				...(compatibility ? { compatibility } : {}),
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

	it("rejects case-insensitive duplicate email types over HTTP POST", async () => {
		const auth = createSCIMAuth();
		const response = await auth.handler(
			createUserRequest({
				userName: "duplicate-types@example.com",
				emails: [
					{
						value: "first@example.com",
						type: "Work",
						primary: true,
					},
					{ value: "second@example.com", type: "work" },
				],
			}),
		);

		await expectSCIMError(response, 400, "invalidValue");
	});

	it("rejects case-insensitive duplicate complex types over HTTP PUT without replacing the User", async () => {
		const auth = createSCIMAuth();
		const createResponse = await auth.handler(
			createUserRequest({
				userName: "replace-types@example.com",
				displayName: "Original User",
			}),
		);
		const created = await readJson<SCIMUserResponse>(createResponse);
		const resourceURL = `${SCIM_USERS_URL}/${encodeURIComponent(created.id)}`;
		const headers = {
			accept: SCIM_MEDIA_TYPE,
			authorization: "Bearer active-scim-token",
			"content-type": SCIM_MEDIA_TYPE,
		};
		const beforeResponse = await auth.handler(
			new Request(resourceURL, { headers }),
		);
		const before = await readJson(beforeResponse);

		const response = await auth.handler(
			new Request(resourceURL, {
				method: "PUT",
				headers,
				body: JSON.stringify({
					schemas: [SCIM_USER_SCHEMA],
					userName: "replace-types@example.com",
					displayName: "Rejected Replacement",
					phoneNumbers: [
						{ value: "+1-555-0100", type: "Work" },
						{ value: "+1-555-0101", type: "work" },
					],
				}),
			}),
		);

		await expectSCIMError(response, 400, "invalidValue");
		const afterResponse = await auth.handler(
			new Request(resourceURL, { headers }),
		);
		expect(await readJson(afterResponse)).toEqual(before);
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

	it("accepts the standard Enterprise User extension schema", async () => {
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

		expect(response.status).toBe(201);
		expect(await readJson(response)).toMatchObject({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			[SCIM_ENTERPRISE_USER_SCHEMA]: { employeeNumber: "42" },
		});
	});

	it("rejects unknown User schema URIs", async () => {
		const auth = createSCIMAuth();
		const unsupportedUserSchema =
			"urn:example:params:scim:schemas:extension:2.0:User";
		const response = await auth.handler(
			new Request(SCIM_USERS_URL, {
				method: "POST",
				headers: {
					accept: SCIM_MEDIA_TYPE,
					authorization: "Bearer active-scim-token",
					"content-type": SCIM_MEDIA_TYPE,
				},
				body: JSON.stringify({
					schemas: [SCIM_USER_SCHEMA, unsupportedUserSchema],
					userName: "unsupported@example.com",
					[unsupportedUserSchema]: { employeeNumber: "42" },
				}),
			}),
		);

		await expectSCIMError(response, 400, "invalidValue");
	});

	it("rejects Enterprise User data without its schema URI", async () => {
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
					schemas: [SCIM_USER_SCHEMA],
					userName: "undeclared-enterprise@example.com",
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

	/**
	 * @see https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups
	 */
	it("accepts the exact classic Entra Group marker only on enabled POST ingress", async () => {
		const auth = createSCIMAuth(undefined, {
			microsoftEntra: { acceptLegacyGroupSchema: true },
		});
		const headers = {
			accept: SCIM_MEDIA_TYPE,
			authorization: "Bearer active-scim-token",
			"content-type": SCIM_MEDIA_TYPE,
		};
		const createResponse = await auth.handler(
			new Request(SCIM_GROUPS_URL, {
				method: "POST",
				headers,
				body: JSON.stringify({
					schemas: [
						SCIM_GROUP_SCHEMA,
						SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
					],
					externalId: "73f7f508-4e50-4b7f-ba50-0cdbf0638d95",
					displayName: "Marketing",
					members: [],
					meta: { resourceType: "Group" },
				}),
			}),
		);

		expect(createResponse.status).toBe(201);
		const created = await readJson<Record<string, unknown>>(createResponse);
		expect(created.schemas).toEqual([SCIM_GROUP_SCHEMA]);
		expect(created.meta).toMatchObject({
			resourceType: "Group",
			location: expect.stringMatching(/\/scim\/v2\/Groups\/[^/]+$/u),
		});
		expect(created).not.toHaveProperty(
			SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
		);
		expect(JSON.stringify(created)).not.toContain(
			SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
		);
		if (typeof created.id !== "string") {
			throw new Error("Expected the classic Entra Group to have an id");
		}

		const getResponse = await auth.handler(
			new Request(`${SCIM_GROUPS_URL}/${encodeURIComponent(created.id)}`, {
				headers,
			}),
		);
		expect(getResponse.status).toBe(200);
		expect(JSON.stringify(await readJson(getResponse))).not.toContain(
			SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
		);

		const schemasResponse = await auth.handler(
			new Request(`${BASE_URL}/api/auth/scim/v2/Schemas`, { headers }),
		);
		expect(schemasResponse.status).toBe(200);
		expect(JSON.stringify(await readJson(schemasResponse))).not.toContain(
			SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
		);

		const replaceResponse = await auth.handler(
			new Request(`${SCIM_GROUPS_URL}/${encodeURIComponent(created.id)}`, {
				method: "PUT",
				headers,
				body: JSON.stringify({
					schemas: [
						SCIM_GROUP_SCHEMA,
						SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
					],
					displayName: "Marketing",
				}),
			}),
		);
		await expectSCIMError(replaceResponse, 400, "invalidValue");

		const patchResponse = await auth.handler(
			new Request(`${SCIM_GROUPS_URL}/${encodeURIComponent(created.id)}`, {
				method: "PATCH",
				headers,
				body: JSON.stringify({
					schemas: [
						SCIM_PATCH_SCHEMA,
						SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
					],
					Operations: [
						{
							op: "Replace",
							path: "displayName",
							value: "Marketing leaders",
						},
					],
				}),
			}),
		);
		await expectSCIMError(patchResponse, 400, "invalidValue");

		const attributedReplaceResponse = await auth.handler(
			new Request(`${SCIM_GROUPS_URL}/${encodeURIComponent(created.id)}`, {
				method: "PUT",
				headers,
				body: JSON.stringify({
					schemas: [SCIM_GROUP_SCHEMA],
					displayName: "Marketing",
					[SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA]: {},
				}),
			}),
		);
		await expectSCIMError(attributedReplaceResponse, 400, "invalidValue");

		const attributedPatchResponse = await auth.handler(
			new Request(`${SCIM_GROUPS_URL}/${encodeURIComponent(created.id)}`, {
				method: "PATCH",
				headers,
				body: JSON.stringify({
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{
							op: "Replace",
							path: "displayName",
							value: "Marketing leaders",
						},
					],
					[SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA]: {},
				}),
			}),
		);
		await expectSCIMError(attributedPatchResponse, 400, "invalidValue");
	});

	it("rejects disabled, attributed, duplicate, unknown, and Graph Group schema markers", async () => {
		const disabledAuth = createSCIMAuth();
		const enabledAuth = createSCIMAuth(undefined, {
			microsoftEntra: { acceptLegacyGroupSchema: true },
		});
		const headers = {
			accept: SCIM_MEDIA_TYPE,
			authorization: "Bearer active-scim-token",
			"content-type": SCIM_MEDIA_TYPE,
		};
		const create = (auth: ReturnType<typeof createSCIMAuth>, body: unknown) =>
			auth.handler(
				new Request(SCIM_GROUPS_URL, {
					method: "POST",
					headers,
					body: JSON.stringify(body),
				}),
			);

		await expectSCIMError(
			await create(disabledAuth, {
				schemas: [SCIM_GROUP_SCHEMA, SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA],
				displayName: "Disabled compatibility",
			}),
			400,
			"invalidValue",
		);
		await expectSCIMError(
			await create(enabledAuth, {
				schemas: [SCIM_GROUP_SCHEMA, SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA],
				displayName: "Attributed marker",
				[SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA]: {
					department: "Marketing",
				},
			}),
			400,
			"invalidValue",
		);
		await expectSCIMError(
			await create(enabledAuth, {
				schemas: [
					SCIM_GROUP_SCHEMA,
					SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
					SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
				],
				displayName: "Duplicate marker",
			}),
			400,
			"invalidValue",
		);
		await expectSCIMError(
			await create(enabledAuth, {
				schemas: [
					SCIM_GROUP_SCHEMA,
					"urn:example:params:scim:schemas:extension:2.0:Group",
				],
				displayName: "Unknown extension",
			}),
			400,
			"invalidValue",
		);
		await expectSCIMError(
			await create(enabledAuth, {
				schemas: [SCIM_GROUP_SCHEMA, SCIM_MICROSOFT_GRAPH_GROUP_SCHEMA],
				displayName: "Graph extension",
			}),
			400,
			"invalidValue",
		);
	});

	it("rejects the User-only Enterprise schema on a Group resource", async () => {
		const auth = createSCIMAuth();
		const response = await auth.handler(
			new Request(SCIM_GROUPS_URL, {
				method: "POST",
				headers: {
					accept: SCIM_MEDIA_TYPE,
					authorization: "Bearer active-scim-token",
					"content-type": SCIM_MEDIA_TYPE,
				},
				body: JSON.stringify({
					schemas: [SCIM_GROUP_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
					displayName: "Engineering",
					[SCIM_ENTERPRISE_USER_SCHEMA]: { department: "Engineering" },
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
