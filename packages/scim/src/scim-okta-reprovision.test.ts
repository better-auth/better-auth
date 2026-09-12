import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { getMigrations } from "better-auth/db/migration";
import { getHttpTestInstance } from "better-auth/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scim } from ".";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const SCIM_MEDIA_TYPE = "application/scim+json";
const SCIM_TOKEN = "okta-reprovision-token";

interface SCIMUserResponse {
	schemas: string[];
	id: string;
	userName: string;
	externalId?: string;
	displayName?: string;
	active: boolean;
}

interface SCIMErrorResponse {
	schemas: string[];
	status: string;
	detail?: string;
	scimType?: string;
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
							id: "okta-reprovision",
							credentials: [
								{
									type: "bearer",
									id: "okta-reprovision-token",
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
 * Okta's account deactivation/reactivation lifecycle removes the user's app
 * assignment on deactivate and sends a fresh `POST /scim/v2/Users` with the
 * same stable externalId when the account is re-assigned. The retained
 * inactive SCIM User must be restored (same SCIM id) instead of rejected
 * with a uniqueness conflict.
 *
 * @see https://github.com/better-auth/better-auth/issues/11111
 */
describe("Okta deprovision/reprovision lifecycle", () => {
	let instance: Awaited<ReturnType<typeof createTestInstance>>["instance"];
	let sqlite: Awaited<ReturnType<typeof createTestInstance>>["sqlite"];
	let usersURL: string;

	const externalId = "okta-external-id-11111";
	const userName = "reprovision.case@example.com";

	beforeAll(async () => {
		const created = await createTestInstance();
		instance = created.instance;
		sqlite = created.sqlite;
		usersURL = `${instance.baseURL}/api/auth/scim/v2/Users`;
	});

	afterAll(async () => {
		await instance.server.close();
		sqlite.close();
	});

	it("restores the inactive SCIM User on re-POST, preserving its SCIM id", async () => {
		const createResponse = await fetch(usersURL, {
			method: "POST",
			headers: createSCIMHeaders(),
			body: JSON.stringify({
				schemas: [SCIM_USER_SCHEMA],
				userName,
				externalId,
				name: { givenName: "Reprovision", familyName: "Case" },
				emails: [{ value: userName, type: "work", primary: true }],
				displayName: "Reprovision Case",
				active: true,
			}),
		});
		expect(createResponse.status).toBe(201);
		const created = await readJSON<SCIMUserResponse>(createResponse);
		expect(created.active).toBe(true);

		// Okta deactivates the account: SCIM update marking the user inactive.
		const deactivateResponse = await fetch(`${usersURL}/${created.id}`, {
			method: "PATCH",
			headers: createSCIMHeaders(),
			body: JSON.stringify({
				schemas: [SCIM_PATCH_SCHEMA],
				Operations: [{ op: "replace", path: "active", value: false }],
			}),
		});
		expect(deactivateResponse.status).toBe(200);
		expect((await readJSON<SCIMUserResponse>(deactivateResponse)).active).toBe(
			false,
		);

		// Okta reactivates the account: a fresh POST with the same externalId.
		const reprovisionResponse = await fetch(usersURL, {
			method: "POST",
			headers: createSCIMHeaders(),
			body: JSON.stringify({
				schemas: [SCIM_USER_SCHEMA],
				userName,
				externalId,
				name: { givenName: "Reprovisioned", familyName: "Case" },
				emails: [{ value: userName, type: "work", primary: true }],
				displayName: "Reprovisioned Case",
				active: true,
			}),
		});
		expect(reprovisionResponse.status).toBe(200);
		const restored = await readJSON<SCIMUserResponse>(reprovisionResponse);
		expect(restored.id).toBe(created.id);
		expect(restored.externalId).toBe(externalId);
		expect(restored.active).toBe(true);
		expect(restored.displayName).toBe("Reprovisioned Case");

		const getResponse = await fetch(`${usersURL}/${created.id}`, {
			headers: createSCIMHeaders(),
		});
		expect(getResponse.status).toBe(200);
		expect((await readJSON<SCIMUserResponse>(getResponse)).active).toBe(true);
	});

	it("still returns 409 when the matching SCIM User is active", async () => {
		const activeExternalId = "okta-external-id-active";
		const activeUserName = "active.collision@example.com";
		const firstResponse = await fetch(usersURL, {
			method: "POST",
			headers: createSCIMHeaders(),
			body: JSON.stringify({
				schemas: [SCIM_USER_SCHEMA],
				userName: activeUserName,
				externalId: activeExternalId,
				emails: [{ value: activeUserName, type: "work", primary: true }],
				displayName: "Active Collision",
				active: true,
			}),
		});
		expect(firstResponse.status).toBe(201);

		const duplicateResponse = await fetch(usersURL, {
			method: "POST",
			headers: createSCIMHeaders(),
			body: JSON.stringify({
				schemas: [SCIM_USER_SCHEMA],
				userName: activeUserName,
				externalId: activeExternalId,
				emails: [{ value: activeUserName, type: "work", primary: true }],
				displayName: "Active Collision",
				active: true,
			}),
		});
		expect(duplicateResponse.status).toBe(409);
		const error = await readJSON<SCIMErrorResponse>(duplicateResponse);
		expect(error.schemas).toContain(SCIM_ERROR_SCHEMA);
		expect(error.scimType).toBe("uniqueness");
	});

	it("still returns 409 when an inactive row's userName collides with another user", async () => {
		const sharedExternalId = "okta-external-id-username-collision";
		const firstUserName = "username.collision.first@example.com";
		const secondUserName = "username.collision.second@example.com";

		// First user is provisioned, then deactivated.
		const firstResponse = await fetch(usersURL, {
			method: "POST",
			headers: createSCIMHeaders(),
			body: JSON.stringify({
				schemas: [SCIM_USER_SCHEMA],
				userName: firstUserName,
				externalId: sharedExternalId,
				emails: [{ value: firstUserName, type: "work", primary: true }],
				displayName: "First Collision",
				active: true,
			}),
		});
		expect(firstResponse.status).toBe(201);
		const first = await readJSON<SCIMUserResponse>(firstResponse);
		const deactivateResponse = await fetch(`${usersURL}/${first.id}`, {
			method: "PATCH",
			headers: createSCIMHeaders(),
			body: JSON.stringify({
				schemas: [SCIM_PATCH_SCHEMA],
				Operations: [{ op: "replace", path: "active", value: false }],
			}),
		});
		expect(deactivateResponse.status).toBe(200);

		// A second active user now owns the userName the re-POST will carry.
		const secondResponse = await fetch(usersURL, {
			method: "POST",
			headers: createSCIMHeaders(),
			body: JSON.stringify({
				schemas: [SCIM_USER_SCHEMA],
				userName: secondUserName,
				emails: [{ value: secondUserName, type: "work", primary: true }],
				displayName: "Second Collision",
				active: true,
			}),
		});
		expect(secondResponse.status).toBe(201);

		// Re-POST with the inactive row's externalId but the second user's
		// userName must still conflict instead of restoring.
		const collisionResponse = await fetch(usersURL, {
			method: "POST",
			headers: createSCIMHeaders(),
			body: JSON.stringify({
				schemas: [SCIM_USER_SCHEMA],
				userName: secondUserName,
				externalId: sharedExternalId,
				emails: [{ value: secondUserName, type: "work", primary: true }],
				displayName: "Second Collision",
				active: true,
			}),
		});
		expect(collisionResponse.status).toBe(409);
	});
});
