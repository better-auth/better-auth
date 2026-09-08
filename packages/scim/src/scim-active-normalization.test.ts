import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { getMigrations } from "better-auth/db/migration";
import { getHttpTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import { normalizeSCIMUserEntraCompatibilityRequestBody } from "./active-normalization";
import type { SCIMProjectedUserState } from "./configuration";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_MEDIA_TYPE = "application/scim+json";
const SCIM_TOKEN = "active-normalization-token";

interface SCIMUserResponse {
	id: string;
	active: boolean;
}

interface SCIMSchemaResponse {
	Resources: {
		id: string;
		attributes: { name: string; type: string }[];
	}[];
}

interface SCIMErrorResponse {
	schemas: string[];
	status: string;
	scimType?: string;
}

type StringActiveScenario =
	| "create"
	| "replace"
	| "path-patch"
	| "pathless-patch"
	| "schema-qualified-patch";

describe("SCIM User active ingress helper", () => {
	it.each([
		["true", true],
		["True", true],
		["TRUE", true],
		["tRuE", true],
		["false", false],
		["False", false],
		["FALSE", false],
		["fAlSe", false],
	] as const)("normalizes the exact case-insensitive string %s at POST and PUT boundaries", (value, expected) => {
		for (const method of ["POST", "PUT"] as const) {
			const body = {
				schemas: [SCIM_USER_SCHEMA],
				userName: "boundary@example.com",
				active: value,
			};
			const normalized = normalizeSCIMUserEntraCompatibilityRequestBody(
				method,
				body,
			);

			expect(normalized).not.toBe(body);
			expect(normalized).toEqual({ ...body, active: expected });
			expect(body.active).toBe(value);
		}
	});

	it.each([
		true,
		false,
		" true",
		"true ",
		" false ",
		"",
		"yes",
		"1",
		"0",
		1,
		0,
		null,
		[],
		[true],
		{},
		{ value: true },
	] as const)("leaves the rejected near-miss unchanged at POST and PUT boundaries", (value) => {
		for (const method of ["POST", "PUT"] as const) {
			const body = {
				schemas: [SCIM_USER_SCHEMA],
				userName: "boundary@example.com",
				active: value,
			};

			expect(normalizeSCIMUserEntraCompatibilityRequestBody(method, body)).toBe(
				body,
			);
		}
	});

	it("copies only User active containers whose values change", () => {
		const untouchedOperation = {
			op: "replace",
			path: "displayName",
			value: "False",
		};
		const body = {
			schemas: [SCIM_PATCH_SCHEMA],
			Operations: [
				{ op: "replace", path: "active", value: "False" },
				untouchedOperation,
			],
		};
		const normalized = normalizeSCIMUserEntraCompatibilityRequestBody(
			"PATCH",
			body,
		);

		expect(normalized).not.toBe(body);
		expect(normalized).toEqual({
			...body,
			Operations: [
				{ op: "replace", path: "active", value: false },
				untouchedOperation,
			],
		});
		expect((normalized as typeof body).Operations[1]).toBe(untouchedOperation);
		expect(body.Operations[0]?.value).toBe("False");
		expect(
			normalizeSCIMUserEntraCompatibilityRequestBody("PATCH", {
				...body,
				Operations: [untouchedOperation],
			}),
		).toEqual({ ...body, Operations: [untouchedOperation] });
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("rewrites only changed User bodies while preserving request transport", async () => {
		const plugin = scim({
			connections: [
				{
					id: "request-normalization",
					credentials: [
						{
							type: "bearer",
							id: "request-normalization-token",
							token: "request-normalization-token",
						},
					],
				},
			],
		});
		const controller = new AbortController();
		const request = new Request("https://example.com/api/auth/scim/v2/Users", {
			method: "POST",
			headers: {
				authorization: "Bearer request-normalization-token",
				"content-length": "999",
				"content-type": SCIM_MEDIA_TYPE,
				"x-request-marker": "preserved",
			},
			body: JSON.stringify({
				schemas: [SCIM_USER_SCHEMA],
				userName: "rewritten@example.com",
				active: "False",
			}),
			signal: controller.signal,
		});
		const result = await plugin.onRequest?.(request);
		if (!result || !("request" in result) || !result.request) {
			throw new Error("Expected a normalized SCIM User request");
		}

		expect(result.request.method).toBe("POST");
		expect(result.request.headers.get("authorization")).toBe(
			"Bearer request-normalization-token",
		);
		expect(result.request.headers.get("x-request-marker")).toBe("preserved");
		expect(result.request.headers.has("content-length")).toBe(false);
		expect(await result.request.json()).toMatchObject({ active: false });
		expect(result.request.signal.aborted).toBe(false);
		controller.abort();
		expect(result.request.signal.aborted).toBe(true);

		const requestAcrossRuntimeBoundary = new Request(
			"https://example.com/api/auth/scim/v2/Users",
			{
				method: "POST",
				headers: {
					authorization: "Bearer request-normalization-token",
					"content-type": SCIM_MEDIA_TYPE,
				},
				body: JSON.stringify({
					schemas: [SCIM_USER_SCHEMA],
					userName: "runtime-boundary@example.com",
					active: "True",
				}),
			},
		);
		const requestLike = {
			url: requestAcrossRuntimeBoundary.url,
			method: requestAcrossRuntimeBoundary.method,
			headers: requestAcrossRuntimeBoundary.headers,
			signal: requestAcrossRuntimeBoundary.signal,
			clone: () => requestAcrossRuntimeBoundary.clone(),
		} as Request;
		const boundaryResult = await plugin.onRequest?.(requestLike);
		if (
			!boundaryResult ||
			!("request" in boundaryResult) ||
			!boundaryResult.request
		) {
			throw new Error("Expected a runtime-boundary request to be normalized");
		}
		expect(await boundaryResult.request.json()).toMatchObject({ active: true });

		const unchangedUser = new Request(
			"https://example.com/api/auth/scim/v2/Users",
			{
				method: "POST",
				headers: { "content-type": SCIM_MEDIA_TYPE },
				body: JSON.stringify({
					schemas: [SCIM_USER_SCHEMA],
					userName: "native@example.com",
					active: false,
				}),
			},
		);
		expect(await plugin.onRequest?.(unchangedUser)).toBeUndefined();

		const group = new Request("https://example.com/api/auth/scim/v2/Groups", {
			method: "POST",
			headers: { "content-type": SCIM_MEDIA_TYPE },
			body: JSON.stringify({
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "False",
				active: "False",
			}),
		});
		expect(await plugin.onRequest?.(group)).toBeUndefined();
	});
});

describe("SCIM User multi-valued primary ingress helper", () => {
	it.each([
		["true", true],
		["True", true],
		["TRUE", true],
		["tRuE", true],
		["false", false],
		["False", false],
		["FALSE", false],
		["fAlSe", false],
	] as const)("normalizes the exact case-insensitive string %s for every multi-valued primary at POST and PUT boundaries", (value, expected) => {
		for (const method of ["POST", "PUT"] as const) {
			const body = {
				schemas: [SCIM_USER_SCHEMA],
				userName: "primary-boundary@example.com",
				emails: [
					{
						value: "primary-boundary@example.com",
						type: "work",
						primary: value,
					},
				],
				phoneNumbers: [{ value: "+1-555-0100", primary: value }],
				addresses: [{ formatted: "1 Infinite Loop", primary: value }],
				roles: [{ value: "engineer", primary: value }],
				entitlements: [{ value: "license", primary: value }],
			};
			const normalized = normalizeSCIMUserEntraCompatibilityRequestBody(
				method,
				body,
			) as typeof body;

			expect(normalized).not.toBe(body);
			expect(normalized.emails[0]?.primary).toBe(expected);
			expect(normalized.phoneNumbers[0]?.primary).toBe(expected);
			expect(normalized.addresses[0]?.primary).toBe(expected);
			expect(normalized.roles[0]?.primary).toBe(expected);
			expect(normalized.entitlements[0]?.primary).toBe(expected);
			expect(body.emails[0]?.primary).toBe(value);
		}
	});

	it.each([
		true,
		false,
		" true",
		"true ",
		" false ",
		"",
		"yes",
		"1",
		"0",
		1,
		0,
		null,
		[],
		{},
	] as const)("leaves the rejected near-miss primary value unchanged at POST and PUT boundaries", (value) => {
		for (const method of ["POST", "PUT"] as const) {
			const body = {
				schemas: [SCIM_USER_SCHEMA],
				userName: "primary-near-miss@example.com",
				emails: [{ value: "primary-near-miss@example.com", primary: value }],
			};

			expect(normalizeSCIMUserEntraCompatibilityRequestBody(method, body)).toBe(
				body,
			);
		}
	});

	it("copies only the multi-valued entries whose primary value changes", () => {
		const untouchedEmail = {
			value: "untouched@example.com",
			type: "home",
			primary: true,
		};
		const body = {
			schemas: [SCIM_USER_SCHEMA],
			userName: "copy-on-write@example.com",
			emails: [
				{ value: "changed@example.com", type: "work", primary: "True" },
				untouchedEmail,
			],
		};
		const normalized = normalizeSCIMUserEntraCompatibilityRequestBody(
			"POST",
			body,
		) as typeof body;

		expect(normalized).not.toBe(body);
		expect(normalized.emails[0]).toEqual({ ...body.emails[0], primary: true });
		expect(normalized.emails[1]).toBe(untouchedEmail);
		expect(body.emails[0]?.primary).toBe("True");
	});

	it("normalizes a filtered-path value targeting the primary sub-attribute directly", () => {
		const body = {
			schemas: [SCIM_PATCH_SCHEMA],
			Operations: [
				{
					op: "replace",
					path: 'emails[type eq "work"].primary',
					value: "true",
				},
			],
		};

		expect(
			normalizeSCIMUserEntraCompatibilityRequestBody("PATCH", body),
		).toEqual({
			...body,
			Operations: [
				{
					op: "replace",
					path: 'emails[type eq "work"].primary',
					value: true,
				},
			],
		});
	});

	it("normalizes a filtered-path value with whitespace around the filter and dot", () => {
		const body = {
			schemas: [SCIM_PATCH_SCHEMA],
			Operations: [
				{
					op: "replace",
					path: 'roles [ type eq "engineer" ] . primary',
					value: "true",
				},
			],
		};

		expect(
			normalizeSCIMUserEntraCompatibilityRequestBody("PATCH", body),
		).toEqual({
			...body,
			Operations: [
				{
					op: "replace",
					path: 'roles [ type eq "engineer" ] . primary',
					value: true,
				},
			],
		});
	});

	it("normalizes primary inside a filtered-path element replace value", () => {
		const body = {
			schemas: [SCIM_PATCH_SCHEMA],
			Operations: [
				{
					op: "replace",
					path: 'addresses[type eq "work"]',
					value: { formatted: "1 Infinite Loop", primary: "true" },
				},
			],
		};

		expect(
			normalizeSCIMUserEntraCompatibilityRequestBody("PATCH", body),
		).toEqual({
			...body,
			Operations: [
				{
					op: "replace",
					path: 'addresses[type eq "work"]',
					value: { formatted: "1 Infinite Loop", primary: true },
				},
			],
		});
	});

	it("normalizes primary inside an unfiltered attribute-path array replace value", () => {
		const body = {
			schemas: [SCIM_PATCH_SCHEMA],
			Operations: [
				{
					op: "replace",
					path: "roles",
					value: [{ value: "engineer", primary: "true" }],
				},
			],
		};

		expect(
			normalizeSCIMUserEntraCompatibilityRequestBody("PATCH", body),
		).toEqual({
			...body,
			Operations: [
				{
					op: "replace",
					path: "roles",
					value: [{ value: "engineer", primary: true }],
				},
			],
		});
	});

	it("normalizes a direct unfiltered primary sub-attribute path target", () => {
		const body = {
			schemas: [SCIM_PATCH_SCHEMA],
			Operations: [{ op: "replace", path: "emails.primary", value: "false" }],
		};

		expect(
			normalizeSCIMUserEntraCompatibilityRequestBody("PATCH", body),
		).toEqual({
			...body,
			Operations: [{ op: "replace", path: "emails.primary", value: false }],
		});
	});

	it("normalizes active and multi-valued primary fields inside a pathless full-resource PATCH value", () => {
		const body = {
			schemas: [SCIM_PATCH_SCHEMA],
			Operations: [
				{
					op: "replace",
					value: {
						active: "true",
						emails: [{ value: "a@example.com", primary: "true" }],
						addresses: [{ formatted: "1 Infinite Loop", primary: "TRUE" }],
					},
				},
			],
		};

		expect(
			normalizeSCIMUserEntraCompatibilityRequestBody("PATCH", body),
		).toEqual({
			...body,
			Operations: [
				{
					op: "replace",
					value: {
						active: true,
						emails: [{ value: "a@example.com", primary: true }],
						addresses: [{ formatted: "1 Infinite Loop", primary: true }],
					},
				},
			],
		});
	});

	it("leaves an untouched PATCH operation unchanged", () => {
		const untouchedOperation = {
			op: "replace",
			path: "displayName",
			value: "False",
		};
		const body = {
			schemas: [SCIM_PATCH_SCHEMA],
			Operations: [untouchedOperation],
		};

		expect(
			normalizeSCIMUserEntraCompatibilityRequestBody("PATCH", body),
		).toEqual(body);
	});
});

function createSCIMHeaders(): HeadersInit {
	return {
		accept: SCIM_MEDIA_TYPE,
		authorization: `Bearer ${SCIM_TOKEN}`,
		"content-type": SCIM_MEDIA_TYPE,
	};
}

async function readJSON<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

async function expectSCIMMutationError(
	response: Response,
	scimType: string,
): Promise<void> {
	expect(response.status).toBe(400);
	expect(response.headers.get("content-type")).toBe(SCIM_MEDIA_TYPE);
	expect(await readJSON<SCIMErrorResponse>(response)).toMatchObject({
		schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
		status: "400",
		scimType,
	});
}

async function createTestInstance(
	onProjected?: (state: SCIMProjectedUserState) => void,
) {
	const sqlite = new DatabaseSync(":memory:");
	const instance = await getHttpTestInstance(
		{
			database: {
				dialect: new NodeSqliteDialect({ database: sqlite }),
				type: "sqlite",
				transaction: true,
			},
			plugins: [
				scim({
					connections: [
						{
							id: "active-normalization",
							credentials: [
								{
									type: "bearer",
									id: "active-normalization-token",
									token: SCIM_TOKEN,
								},
							],
						},
					],
					...(onProjected
						? {
								projection: {
									reconcileUser(state) {
										onProjected(state);
									},
								},
							}
						: {}),
				}),
			],
		},
		{ disableTestUser: true, testWith: "sqlite" },
	);
	await (await getMigrations(instance.auth.options)).runMigrations();
	return { instance, sqlite };
}

async function readPersistentMutationState(
	instance: Awaited<ReturnType<typeof createTestInstance>>["instance"],
) {
	const [
		users,
		sessions,
		bindings,
		subjects,
		scimUsers,
		groups,
		memberships,
		grants,
		tombstones,
	] = await Promise.all([
		instance.db.findMany({ model: "user", where: [] }),
		instance.db.findMany({ model: "session", where: [] }),
		instance.db.findMany({ model: "scimConnectionBinding", where: [] }),
		instance.db.findMany({ model: "scimSubject", where: [] }),
		instance.db.findMany({ model: "scimUser", where: [] }),
		instance.db.findMany({ model: "scimGroup", where: [] }),
		instance.db.findMany({ model: "scimGroupMember", where: [] }),
		instance.db.findMany({ model: "scimProjectionGrant", where: [] }),
		instance.db.findMany({ model: "scimIdentityTombstone", where: [] }),
	]);
	return {
		users,
		sessions,
		bindings,
		subjects,
		scimUsers,
		groups,
		memberships,
		grants,
		tombstones,
	};
}

async function createUser(
	baseURL: string,
	active: boolean,
	userName: string,
): Promise<SCIMUserResponse> {
	const response = await fetch(`${baseURL}/api/auth/scim/v2/Users`, {
		method: "POST",
		headers: createSCIMHeaders(),
		body: JSON.stringify({
			schemas: [SCIM_USER_SCHEMA],
			externalId: `directory-${userName}`,
			userName,
			displayName: "Provisioned User",
			emails: [
				{
					value: userName,
					type: "work",
					primary: true,
				},
			],
			active,
		}),
	});
	expect(response.status).toBe(201);
	return readJSON<SCIMUserResponse>(response);
}

describe("SCIM User active HTTP normalization", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/10390
	 */
	it.each([
		{
			scenario: "create",
			active: "False",
			expected: false,
			expectedStatus: 201,
		},
		{
			scenario: "replace",
			active: "True",
			expected: true,
			expectedStatus: 200,
		},
		{
			scenario: "path-patch",
			active: "false",
			expected: false,
			expectedStatus: 200,
		},
		{
			scenario: "pathless-patch",
			active: "TRUE",
			expected: true,
			expectedStatus: 200,
		},
		{
			scenario: "schema-qualified-patch",
			active: "FaLsE",
			expected: false,
			expectedStatus: 200,
		},
	] satisfies {
		scenario: StringActiveScenario;
		active: string;
		expected: boolean;
		expectedStatus: number;
	}[])("normalizes $scenario string active values at the real HTTP ingress", async ({
		scenario,
		active,
		expected,
		expectedStatus,
	}) => {
		const { instance, sqlite } = await createTestInstance();
		try {
			const userName = `${scenario}@example.com`;
			let userId: string;
			let response: Response;

			if (scenario === "create") {
				response = await fetch(`${instance.baseURL}/api/auth/scim/v2/Users`, {
					method: "POST",
					headers: createSCIMHeaders(),
					body: JSON.stringify({
						schemas: [SCIM_USER_SCHEMA],
						externalId: `entra-${scenario}`,
						userName,
						displayName: "Entra Active User",
						emails: [
							{
								value: userName,
								type: "work",
								primary: true,
							},
						],
						active,
					}),
				});
				userId = (await readJSON<SCIMUserResponse>(response.clone())).id;
			} else {
				const user = await createUser(instance.baseURL, !expected, userName);
				userId = user.id;
				const userURL = `${instance.baseURL}/api/auth/scim/v2/Users/${encodeURIComponent(user.id)}`;
				if (scenario === "replace") {
					response = await fetch(userURL, {
						method: "PUT",
						headers: createSCIMHeaders(),
						body: JSON.stringify({
							schemas: [SCIM_USER_SCHEMA],
							externalId: `entra-${scenario}`,
							userName,
							displayName: "Entra Active User",
							emails: [
								{
									value: userName,
									type: "work",
									primary: true,
								},
							],
							active,
						}),
					});
				} else {
					const path =
						scenario === "pathless-patch"
							? undefined
							: scenario === "schema-qualified-patch"
								? `${SCIM_USER_SCHEMA}:active`
								: "active";
					response = await fetch(userURL, {
						method: "PATCH",
						headers: createSCIMHeaders(),
						body: JSON.stringify({
							schemas: [SCIM_PATCH_SCHEMA],
							Operations: [
								path
									? { op: "replace", path, value: active }
									: { op: "replace", value: { active } },
							],
						}),
					});
				}
			}

			expect(response.status).toBe(expectedStatus);
			const resourceResponse = await fetch(
				`${instance.baseURL}/api/auth/scim/v2/Users/${encodeURIComponent(userId)}`,
				{ headers: createSCIMHeaders() },
			);
			expect(resourceResponse.status).toBe(200);
			const resource = await readJSON<SCIMUserResponse>(resourceResponse);
			expect(resource.active).toBe(expected);
			expect(typeof resource.active).toBe("boolean");
			const persisted = await instance.db.findOne<{ active: boolean }>({
				model: "scimUser",
				where: [{ field: "id", value: userId }],
			});
			expect(persisted?.active).toBe(expected);
			expect(typeof persisted?.active).toBe("boolean");
		} finally {
			await instance.server.close();
			sqlite.close();
		}
	});

	it("preserves native Boolean provider requests and Boolean schema discovery", async () => {
		const { instance, sqlite } = await createTestInstance();
		try {
			const response = await fetch(
				`${instance.baseURL}/api/auth/scim/v2/Users`,
				{
					method: "POST",
					headers: createSCIMHeaders(),
					body: JSON.stringify({
						schemas: [SCIM_USER_SCHEMA],
						externalId: "00u-okta-directory-user",
						userName: "okta.user@example.com",
						name: {
							givenName: "Okta",
							familyName: "User",
						},
						displayName: "Okta User",
						emails: [
							{
								value: "okta.user@example.com",
								type: "work",
								primary: true,
							},
						],
						active: true,
					}),
				},
			);
			expect(response.status).toBe(201);
			const resource = await readJSON<SCIMUserResponse>(response);
			expect(resource.active).toBe(true);
			expect(typeof resource.active).toBe("boolean");
			const persisted = await instance.db.findOne<{ active: boolean }>({
				model: "scimUser",
				where: [{ field: "id", value: resource.id }],
			});
			expect(persisted?.active).toBe(true);
			expect(typeof persisted?.active).toBe("boolean");

			const schemasResponse = await fetch(
				`${instance.baseURL}/api/auth/scim/v2/Schemas`,
				{ headers: { accept: SCIM_MEDIA_TYPE } },
			);
			expect(schemasResponse.status).toBe(200);
			const schemas = await readJSON<SCIMSchemaResponse>(schemasResponse);
			const userSchema = schemas.Resources.find(
				(schema) => schema.id === SCIM_USER_SCHEMA,
			);
			expect(
				userSchema?.attributes.find((attribute) => attribute.name === "active"),
			).toMatchObject({ name: "active", type: "boolean" });
		} finally {
			await instance.server.close();
			sqlite.close();
		}
	});

	it("rejects invalid active values across every User mutation shape without persistence", async () => {
		const { instance, sqlite } = await createTestInstance();
		try {
			const usersURL = `${instance.baseURL}/api/auth/scim/v2/Users`;
			const establishBinding = await fetch(usersURL, {
				headers: createSCIMHeaders(),
			});
			expect(establishBinding.status).toBe(200);
			const rejectedCreateBefore = await readPersistentMutationState(instance);
			const rejectedCreate = await fetch(usersURL, {
				method: "POST",
				headers: createSCIMHeaders(),
				body: JSON.stringify({
					schemas: [SCIM_USER_SCHEMA],
					userName: "invalid-create@example.com",
					active: " false",
				}),
			});
			await expectSCIMMutationError(rejectedCreate, "invalidValue");
			expect(await readPersistentMutationState(instance)).toEqual(
				rejectedCreateBefore,
			);

			const created = await createUser(
				instance.baseURL,
				true,
				"invalid-mutations@example.com",
			);
			const userURL = `${usersURL}/${encodeURIComponent(created.id)}`;
			const invalidRequests = [
				{
					method: "PUT",
					body: {
						schemas: [SCIM_USER_SCHEMA],
						userName: "invalid-mutations@example.com",
						active: 1,
					},
				},
				{
					method: "PATCH",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [{ op: "replace", path: "active", value: null }],
					},
				},
				{
					method: "PATCH",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{ op: "replace", value: { active: { value: false } } },
						],
					},
				},
			] as const;
			for (const request of invalidRequests) {
				const before = await readPersistentMutationState(instance);
				const response = await fetch(userURL, {
					method: request.method,
					headers: createSCIMHeaders(),
					body: JSON.stringify(request.body),
				});
				await expectSCIMMutationError(response, "invalidValue");
				expect(await readPersistentMutationState(instance)).toEqual(before);
			}
		} finally {
			await instance.server.close();
			sqlite.close();
		}
	});

	it("rolls back an earlier normalized active operation when a later PATCH operation fails", async () => {
		const projectedStates: SCIMProjectedUserState[] = [];
		const { instance, sqlite } = await createTestInstance((state) => {
			projectedStates.push({
				...state,
				sources: [...state.sources],
				grants: [...state.grants],
			});
		});
		try {
			const created = await createUser(
				instance.baseURL,
				true,
				"atomic-active@example.com",
			);
			const persistedUser = await instance.db.findOne<{
				id: string;
				userId: string;
			}>({
				model: "scimUser",
				where: [{ field: "id", value: created.id }],
			});
			if (!persistedUser) throw new Error("Expected persisted SCIM User");
			const sessionAt = new Date("2030-01-01T00:00:00.000Z");
			await instance.db.create({
				model: "session",
				data: {
					token: "active-normalization-session-token",
					userId: persistedUser.userId,
					expiresAt: new Date("2030-02-01T00:00:00.000Z"),
					createdAt: sessionAt,
					updatedAt: sessionAt,
				},
			});
			const before = await readPersistentMutationState(instance);
			const projectedBefore = structuredClone(projectedStates);
			const resourceBefore = await fetch(
				`${instance.baseURL}/api/auth/scim/v2/Users/${encodeURIComponent(created.id)}`,
				{ headers: createSCIMHeaders() },
			).then(readJSON<SCIMUserResponse>);

			const response = await fetch(
				`${instance.baseURL}/api/auth/scim/v2/Users/${encodeURIComponent(created.id)}`,
				{
					method: "PATCH",
					headers: createSCIMHeaders(),
					body: JSON.stringify({
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{ op: "replace", path: "active", value: "False" },
							{
								op: "replace",
								path: "id",
								value: "must-not-be-applied",
							},
						],
					}),
				},
			);
			await expectSCIMMutationError(response, "mutability");
			expect(await readPersistentMutationState(instance)).toEqual(before);
			expect(projectedStates).toEqual(projectedBefore);
			const resourceAfter = await fetch(
				`${instance.baseURL}/api/auth/scim/v2/Users/${encodeURIComponent(created.id)}`,
				{ headers: createSCIMHeaders() },
			).then(readJSON<SCIMUserResponse>);
			expect(resourceAfter).toEqual(resourceBefore);
			expect(resourceAfter.active).toBe(true);
		} finally {
			await instance.server.close();
			sqlite.close();
		}
	});
});

const SCIM_ENTERPRISE_USER_SCHEMA =
	"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";

interface SCIMPrimaryNormalizationUserResponse {
	id: string;
	active: boolean;
	emails: { value: string; type?: string; primary?: boolean }[];
	addresses: { formatted?: string; type?: string; primary?: boolean }[];
	roles: { value: string; primary?: boolean }[];
	[SCIM_ENTERPRISE_USER_SCHEMA]?: { manager?: { value: string } };
}

describe("SCIM User multi-valued primary HTTP normalization", () => {
	it.each([
		{
			attribute: "emails",
			entry: {
				value: "primary-http@example.com",
				type: "work",
				primary: "true",
			},
		},
		{
			attribute: "addresses",
			entry: { formatted: "1 Infinite Loop", type: "work", primary: "true" },
		},
		{ attribute: "roles", entry: { value: "engineer", primary: "true" } },
		{
			attribute: "phoneNumbers",
			entry: { value: "+1-555-0100", type: "work", primary: "true" },
		},
		{ attribute: "entitlements", entry: { value: "license", primary: "true" } },
	])("normalizes a string primary for $attribute at the real HTTP create ingress", async ({
		attribute,
		entry,
	}) => {
		const { instance, sqlite } = await createTestInstance();
		try {
			const response = await fetch(
				`${instance.baseURL}/api/auth/scim/v2/Users`,
				{
					method: "POST",
					headers: createSCIMHeaders(),
					body: JSON.stringify({
						schemas: [SCIM_USER_SCHEMA],
						userName: `${attribute}-primary@example.com`,
						displayName: "Entra Primary User",
						emails: [
							{
								value: `${attribute}-primary@example.com`,
								type: "work",
								primary: true,
							},
						],
						[attribute]: [entry],
					}),
				},
			);

			expect(response.status).toBe(201);
			const resource = await readJSON<Record<string, unknown>>(response);
			const normalizedEntry = (
				resource[attribute] as { primary?: unknown }[]
			)[0];
			expect(normalizedEntry?.primary).toBe(true);
			expect(typeof normalizedEntry?.primary).toBe("boolean");
		} finally {
			await instance.server.close();
			sqlite.close();
		}
	});

	/**
	 * Mirrors the exact payload shape sent by Microsoft's SCIM Validator,
	 * which encodes every multi-valued `primary` sub-attribute as a string
	 * Boolean and the Enterprise User `manager` as a bare string.
	 */
	it("creates a user from the Microsoft SCIM Validator's exact string-primary payload", async () => {
		const { instance, sqlite } = await createTestInstance();
		try {
			const response = await fetch(
				`${instance.baseURL}/api/auth/scim/v2/Users`,
				{
					method: "POST",
					headers: createSCIMHeaders(),
					body: JSON.stringify({
						schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
						userName: "validator-primary@example.com",
						displayName: "Validator Primary User",
						active: "true",
						emails: [
							{
								value: "validator-primary@example.com",
								type: "work",
								primary: "true",
							},
						],
						addresses: [
							{
								formatted: "1 Infinite Loop, Cupertino, CA",
								type: "work",
								primary: "true",
							},
						],
						roles: [{ value: "engineer", primary: "true" }],
						[SCIM_ENTERPRISE_USER_SCHEMA]: {
							manager: "validator-manager-id",
						},
					}),
				},
			);

			expect(response.status).toBe(201);
			const resource =
				await readJSON<SCIMPrimaryNormalizationUserResponse>(response);
			expect(resource.active).toBe(true);
			expect(typeof resource.active).toBe("boolean");
			expect(resource.emails[0]?.primary).toBe(true);
			expect(typeof resource.emails[0]?.primary).toBe("boolean");
			expect(resource.addresses[0]?.primary).toBe(true);
			expect(typeof resource.addresses[0]?.primary).toBe("boolean");
			expect(resource.roles[0]?.primary).toBe(true);
			expect(typeof resource.roles[0]?.primary).toBe("boolean");
			expect(resource[SCIM_ENTERPRISE_USER_SCHEMA]?.manager).toEqual({
				value: "validator-manager-id",
			});

			const persisted = await instance.db.findOne<{ active: boolean }>({
				model: "scimUser",
				where: [{ field: "id", value: resource.id }],
			});
			expect(persisted?.active).toBe(true);
			expect(typeof persisted?.active).toBe("boolean");
		} finally {
			await instance.server.close();
			sqlite.close();
		}
	});

	it("normalizes a string primary through a filtered PATCH path at the real HTTP ingress", async () => {
		const { instance, sqlite } = await createTestInstance();
		try {
			const created = await createUser(
				instance.baseURL,
				true,
				"patch-primary@example.com",
			);
			const userURL = `${instance.baseURL}/api/auth/scim/v2/Users/${encodeURIComponent(created.id)}`;
			const addRole = await fetch(userURL, {
				method: "PATCH",
				headers: createSCIMHeaders(),
				body: JSON.stringify({
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{
							op: "add",
							path: "roles",
							value: [
								{ value: "engineer", type: "primary-role", primary: false },
							],
						},
					],
				}),
			});
			expect(addRole.status).toBe(200);

			const response = await fetch(userURL, {
				method: "PATCH",
				headers: createSCIMHeaders(),
				body: JSON.stringify({
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{
							op: "replace",
							path: 'roles[type eq "primary-role"].primary',
							value: "true",
						},
					],
				}),
			});

			expect(response.status).toBe(200);
			const resourceResponse = await fetch(userURL, {
				headers: createSCIMHeaders(),
			});
			const resource =
				await readJSON<SCIMPrimaryNormalizationUserResponse>(resourceResponse);
			const primaryRole = (
				resource.roles as { value: string; type?: string; primary?: boolean }[]
			).find((role) => role.type === "primary-role");
			expect(primaryRole?.primary).toBe(true);
			expect(typeof primaryRole?.primary).toBe("boolean");
		} finally {
			await instance.server.close();
			sqlite.close();
		}
	});

	it("normalizes a string primary through a whitespace-padded filtered PATCH path", async () => {
		const { instance, sqlite } = await createTestInstance();
		try {
			const created = await createUser(
				instance.baseURL,
				true,
				"patch-primary-whitespace@example.com",
			);
			const userURL = `${instance.baseURL}/api/auth/scim/v2/Users/${encodeURIComponent(created.id)}`;
			const addRole = await fetch(userURL, {
				method: "PATCH",
				headers: createSCIMHeaders(),
				body: JSON.stringify({
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{
							op: "add",
							path: "roles",
							value: [
								{ value: "engineer", type: "primary-role", primary: false },
							],
						},
					],
				}),
			});
			expect(addRole.status).toBe(200);

			const response = await fetch(userURL, {
				method: "PATCH",
				headers: createSCIMHeaders(),
				body: JSON.stringify({
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{
							op: "replace",
							path: 'roles [ type eq "primary-role" ] . primary',
							value: "true",
						},
					],
				}),
			});

			expect(response.status).toBe(200);
			const resourceResponse = await fetch(userURL, {
				headers: createSCIMHeaders(),
			});
			const resource =
				await readJSON<SCIMPrimaryNormalizationUserResponse>(resourceResponse);
			const primaryRole = (
				resource.roles as { value: string; type?: string; primary?: boolean }[]
			).find((role) => role.type === "primary-role");
			expect(primaryRole?.primary).toBe(true);
			expect(typeof primaryRole?.primary).toBe("boolean");
		} finally {
			await instance.server.close();
			sqlite.close();
		}
	});
});
