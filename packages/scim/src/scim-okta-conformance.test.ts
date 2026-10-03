import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { getMigrations } from "better-auth/db/migration";
import { getHttpTestInstance } from "better-auth/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scim } from ".";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const SCIM_MEDIA_TYPE = "application/scim+json";
const SCIM_TOKEN = "okta-conformance-token";

interface SCIMName {
	givenName?: string;
	familyName?: string;
}

interface SCIMEmail {
	value: string;
	type?: string;
	primary?: boolean;
}

interface SCIMUserResponse {
	schemas: string[];
	id: string;
	userName: string;
	name?: SCIMName;
	displayName?: string;
	active: boolean;
	emails?: SCIMEmail[];
}

interface SCIMListResponse<Resource> {
	schemas: string[];
	totalResults: number;
	startIndex: number;
	itemsPerPage: number;
	Resources: Resource[];
}

interface SCIMErrorResponse {
	schemas: string[];
	status: string;
	detail?: string;
}

async function readJSON<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

function createSCIMHeaders(
	authorization = `Bearer ${SCIM_TOKEN}`,
): HeadersInit {
	return {
		accept: SCIM_MEDIA_TYPE,
		authorization,
		"content-type": SCIM_MEDIA_TYPE,
	};
}

async function createTestInstance() {
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
							id: "okta-conformance",
							credentials: [
								{
									type: "bearer",
									id: "okta-conformance-token",
									token: SCIM_TOKEN,
								},
							],
						},
					],
				}),
			],
		},
		{ disableTestUser: true, testWith: "sqlite" },
	);
	await (await getMigrations(instance.auth.options)).runMigrations();
	return { instance, sqlite };
}

/**
 * Translates Okta's own SCIM 2.0 conformance fixtures, step for step, against
 * a real HTTP listener. Both suites are distributed from
 * `https://developer.okta.com/docs/guides/scim-provisioning-integration-test/main/`
 * ("Configure and run tests" → "Step 1 — Download test files").
 */
describe("Okta SCIM 2.0 SPEC test", () => {
	// @see https://developer.okta.com/standards/SCIM/SCIMFiles/Okta-SCIM-20-SPEC-Test.json
	let instance: Awaited<ReturnType<typeof createTestInstance>>["instance"];
	let sqlite: Awaited<ReturnType<typeof createTestInstance>>["sqlite"];
	let usersURL: string;

	// Okta's own onboarding docs call this "profile sourcing": R1/R2 require the
	// store to already contain at least one User before the suite runs.
	let seededUserId: string;
	const seededUserName = "morgan.chen@example.com";
	const seededGivenName = "Morgan";
	const seededFamilyName = "Chen";

	// Populated by R6, consumed by R7-R9.
	const randomUsername = "jordan.rivera@example.com";
	const randomUsernameCaps = randomUsername.toUpperCase();
	const randomGivenName = "Jordan";
	const randomFamilyName = "Rivera";
	const randomEmail = "jordan.rivera.primary@example.com";
	let idUserOne: string;

	beforeAll(async () => {
		const created = await createTestInstance();
		instance = created.instance;
		sqlite = created.sqlite;
		usersURL = `${instance.baseURL}/api/auth/scim/v2/Users`;

		const seedResponse = await fetch(usersURL, {
			method: "POST",
			headers: createSCIMHeaders(),
			body: JSON.stringify({
				schemas: [SCIM_USER_SCHEMA],
				userName: seededUserName,
				name: { givenName: seededGivenName, familyName: seededFamilyName },
				emails: [{ value: seededUserName, type: "work", primary: true }],
				displayName: `${seededGivenName} ${seededFamilyName}`,
				active: true,
			}),
		});
		expect(seedResponse.status).toBe(201);
		seededUserId = (await readJSON<SCIMUserResponse>(seedResponse)).id;
	});

	afterAll(async () => {
		await instance.server.close();
		sqlite.close();
	});

	it("R1 — Required Test: Test Users endpoint", async () => {
		const response = await fetch(`${usersURL}?count=1&startIndex=1`, {
			headers: createSCIMHeaders(),
		});

		expect(response.status).toBe(200);
		const body = await readJSON<SCIMListResponse<SCIMUserResponse>>(response);
		expect(body.schemas).toContain(SCIM_LIST_SCHEMA);
		expect(typeof body.itemsPerPage).toBe("number");
		expect(typeof body.startIndex).toBe("number");
		expect(typeof body.totalResults).toBe("number");
		expect(body.Resources.length).toBeGreaterThan(0);
		const [resource] = body.Resources;
		expect(resource?.id).toBeTruthy();
		expect(resource?.name?.familyName).toBeTruthy();
		expect(resource?.name?.givenName).toBeTruthy();
		expect(resource?.userName).toBeTruthy();
		expect(resource?.active).toBe(true);
		expect(resource?.emails?.[0]?.value).toBeTruthy();
	});

	it("R2 — Required Test: Get Users/{id}", async () => {
		const response = await fetch(`${usersURL}/${seededUserId}`, {
			headers: createSCIMHeaders(),
		});

		expect(response.status).toBe(200);
		const body = await readJSON<SCIMUserResponse>(response);
		expect(body.id).toBe(seededUserId);
		expect(body.name?.familyName).toBeTruthy();
		expect(body.name?.givenName).toBeTruthy();
		expect(body.userName).toBeTruthy();
		expect(body.active).toBe(true);
		expect(body.emails?.[0]?.value).toBeTruthy();
	});

	it("R3 — Required Test: Test invalid User by username", async () => {
		const response = await fetch(
			`${usersURL}?${new URLSearchParams({
				filter: 'userName eq "nonexistent-user@example.invalid"',
			})}`,
			{ headers: createSCIMHeaders() },
		);

		expect(response.status).toBe(200);
		const body = await readJSON<SCIMListResponse<SCIMUserResponse>>(response);
		expect(body.schemas).toContain(SCIM_LIST_SCHEMA);
		expect(body.totalResults).toBe(0);
	});

	it("R4 — Required Test: Test invalid User by ID", async () => {
		const response = await fetch(`${usersURL}/00000000000000000000`, {
			headers: createSCIMHeaders(),
		});

		expect(response.status).toBe(404);
		const body = await readJSON<SCIMErrorResponse>(response);
		expect(body.detail).toBeTruthy();
		expect(body.schemas).toContain(SCIM_ERROR_SCHEMA);
	});

	it("R5 — Required Test: Make sure random user doesn't exist", async () => {
		const response = await fetch(
			`${usersURL}?${new URLSearchParams({
				filter: `userName eq "${randomUsername}"`,
			})}`,
			{ headers: createSCIMHeaders() },
		);

		expect(response.status).toBe(200);
		const body = await readJSON<SCIMListResponse<SCIMUserResponse>>(response);
		expect(body.totalResults).toBe(0);
		expect(body.schemas).toContain(SCIM_LIST_SCHEMA);
	});

	it("R6 — Required Test: Create Okta user with realistic values", async () => {
		const response = await fetch(usersURL, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${SCIM_TOKEN}`,
				accept: "application/scim+json; charset=utf-8",
			},
			body: JSON.stringify({
				schemas: [SCIM_USER_SCHEMA],
				userName: randomUsername,
				name: { givenName: randomGivenName, familyName: randomFamilyName },
				emails: [{ primary: true, value: randomEmail, type: "work" }],
				displayName: `${randomGivenName} ${randomFamilyName}`,
				active: true,
			}),
		});

		expect(response.status).toBe(201);
		const body = await readJSON<SCIMUserResponse>(response);
		expect(body.active).toBe(true);
		expect(body.id).toBeTruthy();
		expect(body.name?.familyName).toBe(randomFamilyName);
		expect(body.name?.givenName).toBe(randomGivenName);
		expect(body.schemas).toContain(SCIM_USER_SCHEMA);
		expect(body.userName).toBe(randomUsername);
		idUserOne = body.id;
	});

	it("R7 — Required Test: Verify that user was created", async () => {
		const response = await fetch(`${usersURL}/${idUserOne}`, {
			headers: createSCIMHeaders(),
		});

		expect(response.status).toBe(200);
		const body = await readJSON<SCIMUserResponse>(response);
		expect(body.userName).toBe(randomUsername);
		expect(body.name?.familyName).toBe(randomFamilyName);
		expect(body.name?.givenName).toBe(randomGivenName);
	});

	it("R8 — Required Test: Expect failure when recreating user with same values", async () => {
		// Verbatim Okta quirk: the duplicate-check body reuses `randomUsername`
		// (not `randomEmail`) as the email value; the conflict this must trigger
		// is on `userName`, which is identical to R6.
		const response = await fetch(usersURL, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${SCIM_TOKEN}`,
				accept: "application/scim+json; charset=utf-8",
			},
			body: JSON.stringify({
				schemas: [SCIM_USER_SCHEMA],
				userName: randomUsername,
				name: { givenName: randomGivenName, familyName: randomFamilyName },
				emails: [{ primary: true, value: randomUsername, type: "work" }],
				displayName: `${randomGivenName} ${randomFamilyName}`,
				active: true,
			}),
		});

		expect(response.status).toBe(409);
	});

	it("R9 — Required Test: Username Case Sensitivity Check", async () => {
		const response = await fetch(
			`${usersURL}?${new URLSearchParams({
				filter: `userName eq "${randomUsernameCaps}"`,
			})}`,
			{ headers: createSCIMHeaders() },
		);

		// Okta's own suite only requires 200 here; it does not assert match
		// semantics either way. This server additionally documents its own
		// choice: `userNameKey` lookups normalize case, so a differently-cased
		// query still resolves to the same account.
		expect(response.status).toBe(200);
		const body = await readJSON<SCIMListResponse<SCIMUserResponse>>(response);
		expect(body.totalResults).toBe(1);
		expect(body.Resources[0]?.userName).toBe(randomUsername);
	});

	it("R10 — Optional Test: Verify Groups endpoint", async () => {
		const response = await fetch(
			`${instance.baseURL}/api/auth/scim/v2/Groups`,
			{
				headers: createSCIMHeaders(),
			},
		);

		expect(response.status).toBe(200);
		const body = await readJSON<SCIMListResponse<unknown>>(response);
		if (body.totalResults === 0) {
			expect(body.Resources).toEqual([]);
		} else {
			expect(Array.isArray(body.Resources)).toBe(true);
		}
	});

	it("R11 — Required Test: Check status 401", async () => {
		const response = await fetch(
			`${usersURL}?${new URLSearchParams({
				filter: `userName eq "${randomUsernameCaps}"`,
			})}`,
			{ headers: createSCIMHeaders("non-token") },
		);

		expect(response.status).toBe(401);
		const body = await readJSON<SCIMErrorResponse>(response);
		expect(body.detail).toBeTruthy();
		expect(body.status).toBe("401");
		expect(body.schemas).toContain(SCIM_ERROR_SCHEMA);
	});

	it("R12 — Required Test: Check status 404", async () => {
		const response = await fetch(`${usersURL}/00919288221112222`, {
			headers: createSCIMHeaders(),
		});

		expect(response.status).toBe(404);
		const body = await readJSON<SCIMErrorResponse>(response);
		expect(body.detail).toBeTruthy();
		expect(body.status).toBe("404");
		expect(body.schemas).toContain(SCIM_ERROR_SCHEMA);
	});

	// The SPEC test file lists three supported client auth methods (OAuth 2.0
	// Authorization Code, HTTP Basic, and a bearer token), but neither Runscope
	// suite exercises Basic Auth directly. This server deliberately supports
	// only a bearer token in the `Authorization` header (see
	// `ServiceProviderConfig`'s single `oauthbearertoken` scheme); an Okta
	// customer configured for Basic Auth gets a 401 on every call, documented
	// here rather than left implicit.
	// @see https://developer.okta.com/docs/api/openapi/okta-scim/guides/scim-20/
	it("rejects HTTP Basic credentials (Basic Auth is not a supported scheme)", async () => {
		const response = await fetch(usersURL, {
			headers: createSCIMHeaders(
				`Basic ${Buffer.from("okta:okta-conformance-token").toString("base64")}`,
			),
		});

		expect(response.status).toBe(401);
		const body = await readJSON<SCIMErrorResponse>(response);
		expect(body.status).toBe("401");
		expect(body.schemas).toContain(SCIM_ERROR_SCHEMA);
	});
});

/**
 * Translates the CRUD suite's net effect on the SCIM server. The Runscope
 * fixture drives a live Okta org and only polls the SCIM server indirectly
 * (Okta Users/Apps management API calls are out of scope here); this encodes
 * the fixed wire-level sequence those actions are documented to trigger.
 * @see https://developer.okta.com/standards/SCIM/SCIMFiles/Okta-SCIM-20-CRUD-Test.json
 */
describe("Okta SCIM 2.0 CRUD test net wire sequence", () => {
	it("creates, reads, replaces, deactivates, reactivates, and deactivates a user", async () => {
		const { instance, sqlite } = await createTestInstance();
		try {
			const usersURL = `${instance.baseURL}/api/auth/scim/v2/Users`;
			const userName = "riley.okta.test@atko.com";

			// 1. POST /Users — Okta always includes an unsolicited `password`
			// placeholder on create, even when password sync is disabled; the
			// server must accept and may ignore it.
			const createResponse = await fetch(usersURL, {
				method: "POST",
				headers: createSCIMHeaders(),
				body: JSON.stringify({
					schemas: [SCIM_USER_SCHEMA],
					userName,
					name: { givenName: "Riley", familyName: "Okta" },
					emails: [{ value: userName, type: "work", primary: true }],
					displayName: "Riley Okta",
					title: "Engineer",
					phoneNumbers: [{ value: "415.123.4567" }],
					password: "N3verSt0red!",
					active: true,
				}),
			});
			expect(createResponse.status).toBe(201);
			const created = await readJSON<SCIMUserResponse>(createResponse);
			expect(created).not.toHaveProperty("password");

			// 2. GET /Users?filter=userName eq "<email>" — existence check.
			const filterResponse = await fetch(
				`${usersURL}?${new URLSearchParams({
					filter: `userName eq "${userName}"`,
				})}`,
				{ headers: createSCIMHeaders() },
			);
			expect(filterResponse.status).toBe(200);
			const filtered =
				await readJSON<SCIMListResponse<SCIMUserResponse>>(filterResponse);
			expect(filtered.Resources).toHaveLength(1);
			expect(filtered.Resources[0]?.id).toBe(created.id);

			// 3. PUT /Users/{id} — a full-resource read-modify-write: Okta fetches
			// the current resource, changes only `givenName`, and PUTs the entire
			// object back, including fields it never intended to change.
			const beforePut = await readJSON<SCIMUserResponse>(
				await fetch(`${usersURL}/${created.id}`, {
					headers: createSCIMHeaders(),
				}),
			);
			const putResponse = await fetch(`${usersURL}/${created.id}`, {
				method: "PUT",
				headers: createSCIMHeaders(),
				body: JSON.stringify({
					...beforePut,
					name: { ...beforePut.name, givenName: "Rileyupdate" },
				}),
			});
			expect(putResponse.status).toBe(200);
			expect(
				(await readJSON<SCIMUserResponse>(putResponse)).name?.givenName,
			).toBe("Rileyupdate");

			// 4. PATCH /Users/{id} — deactivate (pathless value shape; Okta's
			// documented `{"Operations":[{"op":"replace","value":{"active":false}}]}`).
			const deactivateResponse = await fetch(`${usersURL}/${created.id}`, {
				method: "PATCH",
				headers: createSCIMHeaders(),
				body: JSON.stringify({
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [{ op: "replace", value: { active: false } }],
				}),
			});
			// Okta's guide documents both 200 (full resource) and 204 (no body)
			// as acceptable PATCH responses; this server always returns 200.
			expect(deactivateResponse.status).toBe(200);
			expect(
				(await readJSON<SCIMUserResponse>(deactivateResponse)).active,
			).toBe(false);

			// 5. PATCH /Users/{id} — reactivate (symmetric shape).
			const reactivateResponse = await fetch(`${usersURL}/${created.id}`, {
				method: "PATCH",
				headers: createSCIMHeaders(),
				body: JSON.stringify({
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [{ op: "replace", value: { active: true } }],
				}),
			});
			expect(reactivateResponse.status).toBe(200);
			expect(
				(await readJSON<SCIMUserResponse>(reactivateResponse)).active,
			).toBe(true);

			// 6. A second deactivate PATCH — Okta never sends `DELETE /Users/{id}`;
			// unassigning the integration triggers another deactivation instead.
			const secondDeactivateResponse = await fetch(
				`${usersURL}/${created.id}`,
				{
					method: "PATCH",
					headers: createSCIMHeaders(),
					body: JSON.stringify({
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [{ op: "replace", value: { active: false } }],
					}),
				},
			);
			expect(secondDeactivateResponse.status).toBe(200);
			expect(
				(await readJSON<SCIMUserResponse>(secondDeactivateResponse)).active,
			).toBe(false);
		} finally {
			await instance.server.close();
			sqlite.close();
		}
	});
});
