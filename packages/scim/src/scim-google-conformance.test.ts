import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { getMigrations } from "better-auth/db/migration";
import { getHttpTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_MEDIA_TYPE = "application/scim+json";
const SCIM_TOKEN = "google-conformance-token";

interface SCIMUserResponse {
	id: string;
	userName: string;
	active: boolean;
}

interface SCIMGroupResponse {
	id: string;
	displayName: string;
	members?: { value: string }[];
}

interface SCIMErrorResponse {
	schemas: string[];
	status: string;
}

interface SCIMSchemaAttribute {
	name: string;
	type: string;
	multiValued: boolean;
	required: boolean;
	mutability?: string;
	subAttributes?: SCIMSchemaAttribute[];
}

interface SCIMSchemaResponse {
	id: string;
	attributes: SCIMSchemaAttribute[];
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
							id: "google-conformance",
							credentials: [
								{
									type: "bearer",
									id: "google-conformance-token",
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
 * Google Workspace/Cloud Identity is the SCIM client for its "automated user
 * provisioning" feature, calling out to a third-party app's SCIM server the
 * same way Okta does. Unlike Okta, Google does not publish a developer-facing
 * wire-level SCIM specification for the receiving server; every test here
 * encodes only the high-confidence requirements extracted from Google
 * Workspace's admin-facing documentation, each with its own citation. Filter,
 * pagination, and PATCH wire shapes are not documented by Google for this
 * surface and are intentionally left untested here (the RFC 7644 baseline
 * other conformance suites already exercise is the only defensible
 * assumption).
 */
describe("Google Workspace/Cloud Identity automated provisioning client", () => {
	/**
	 * @see https://knowledge.workspace.google.com/admin/users/advanced/configure-amazon-web-services-user-provisioning
	 * @see https://support.google.com/a/answer/9291789
	 */
	describe("R1 — bearer/access token auth, admin-pasted, no OAuth flow", () => {
		it("accepts the connection's bearer token", async () => {
			const { instance, sqlite } = await createTestInstance();
			try {
				const response = await fetch(
					`${instance.baseURL}/api/auth/scim/v2/Users`,
					{ headers: createSCIMHeaders() },
				);

				expect(response.status).toBe(200);
			} finally {
				await instance.server.close();
				sqlite.close();
			}
		});

		it("rejects a missing or invalid token with 401", async () => {
			const { instance, sqlite } = await createTestInstance();
			try {
				const missing = await fetch(
					`${instance.baseURL}/api/auth/scim/v2/Users`,
					{ headers: createSCIMHeaders("") },
				);
				const stale = await fetch(
					`${instance.baseURL}/api/auth/scim/v2/Users`,
					{
						headers: createSCIMHeaders("Bearer revoked-or-unknown-token"),
					},
				);

				expect(missing.status).toBe(401);
				expect(stale.status).toBe(401);
				expect((await readJSON<SCIMErrorResponse>(stale)).status).toBe("401");
			} finally {
				await instance.server.close();
				sqlite.close();
			}
		});
	});

	/**
	 * @see https://knowledge.workspace.google.com/admin/users/advanced/configure-amazon-web-services-user-provisioning
	 */
	describe("R3 — deprovisioning: suspend and hard-delete are independent paths", () => {
		it("hard-deletes a still-active user with no prior deactivation call", async () => {
			const { instance, sqlite } = await createTestInstance();
			try {
				const usersURL = `${instance.baseURL}/api/auth/scim/v2/Users`;
				const created = await readJSON<SCIMUserResponse>(
					await fetch(usersURL, {
						method: "POST",
						headers: createSCIMHeaders(),
						body: JSON.stringify({
							schemas: [SCIM_USER_SCHEMA],
							userName: "deleted-from-google@example.com",
							active: true,
						}),
					}),
				);
				expect(created.active).toBe(true);

				const deleteResponse = await fetch(`${usersURL}/${created.id}`, {
					method: "DELETE",
					headers: createSCIMHeaders(),
				});
				expect(deleteResponse.status).toBe(204);

				const afterDelete = await fetch(`${usersURL}/${created.id}`, {
					headers: createSCIMHeaders(),
				});
				expect(afterDelete.status).toBe(404);
			} finally {
				await instance.server.close();
				sqlite.close();
			}
		});

		it("cleans up group membership on a DELETE arriving long after an earlier suspend", async () => {
			const { instance, sqlite } = await createTestInstance();
			try {
				const usersURL = `${instance.baseURL}/api/auth/scim/v2/Users`;
				const groupsURL = `${instance.baseURL}/api/auth/scim/v2/Groups`;
				const created = await readJSON<SCIMUserResponse>(
					await fetch(usersURL, {
						method: "POST",
						headers: createSCIMHeaders(),
						body: JSON.stringify({
							schemas: [SCIM_USER_SCHEMA],
							userName: "delayed-deprovision@example.com",
							active: true,
						}),
					}),
				);
				const group = await readJSON<SCIMGroupResponse>(
					await fetch(groupsURL, {
						method: "POST",
						headers: createSCIMHeaders(),
						body: JSON.stringify({
							schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
							displayName: "Suspended then deleted",
							members: [{ value: created.id }],
						}),
					}),
				);

				// "When a user is suspended from Google" — independent trigger #1.
				const suspendResponse = await fetch(`${usersURL}/${created.id}`, {
					method: "PATCH",
					headers: createSCIMHeaders(),
					body: JSON.stringify({
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [{ op: "replace", value: { active: false } }],
					}),
				});
				expect(suspendResponse.status).toBe(200);

				// "When a user is deleted from Google" — a decoupled, independently
				// configurable trigger that Google's own docs say can arrive up to
				// 21 days later; nothing about it depends on the earlier suspend.
				const deleteResponse = await fetch(`${usersURL}/${created.id}`, {
					method: "DELETE",
					headers: createSCIMHeaders(),
				});
				expect(deleteResponse.status).toBe(204);

				const afterDelete = await fetch(`${usersURL}/${created.id}`, {
					headers: createSCIMHeaders(),
				});
				expect(afterDelete.status).toBe(404);

				const groupAfterDelete = await readJSON<SCIMGroupResponse>(
					await fetch(`${groupsURL}/${group.id}`, {
						headers: createSCIMHeaders(),
					}),
				);
				expect(groupAfterDelete.members).toEqual([]);
			} finally {
				await instance.server.close();
				sqlite.close();
			}
		});
	});

	/**
	 * @see https://knowledge.workspace.google.com/admin/users/advanced/configure-amazon-web-services-user-provisioning
	 */
	describe("R5 — attribute mapping is built live from the receiving app's discovered schema", () => {
		it("discovers a complete, accurately-flagged User attribute list", async () => {
			const { instance, sqlite } = await createTestInstance();
			try {
				const response = await fetch(
					`${instance.baseURL}/api/auth/scim/v2/Schemas/${encodeURIComponent(
						SCIM_USER_SCHEMA,
					)}`,
					{ headers: createSCIMHeaders() },
				);
				expect(response.status).toBe(200);
				const schema = await readJSON<SCIMSchemaResponse>(response);
				const byName = new Map(
					schema.attributes.map((attribute) => [attribute.name, attribute]),
				);

				const userName = byName.get("userName");
				expect(userName?.required).toBe(true);
				expect(userName?.type).toBe("string");

				const active = byName.get("active");
				expect(active?.type).toBe("boolean");
				expect(active?.mutability).toBe("readWrite");

				const emails = byName.get("emails");
				expect(emails?.multiValued).toBe(true);
				expect(emails?.subAttributes?.some((sub) => sub.name === "value")).toBe(
					true,
				);
				expect(
					emails?.subAttributes?.some((sub) => sub.name === "primary"),
				).toBe(true);

				const name = byName.get("name");
				expect(name?.type).toBe("complex");
				expect(
					name?.subAttributes?.some((sub) => sub.name === "givenName"),
				).toBe(true);
				expect(
					name?.subAttributes?.some((sub) => sub.name === "familyName"),
				).toBe(true);
			} finally {
				await instance.server.close();
				sqlite.close();
			}
		});
	});
});
