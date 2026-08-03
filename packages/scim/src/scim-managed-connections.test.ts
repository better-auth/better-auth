import { DatabaseSync } from "node:sqlite";
import { runWithTransaction } from "@better-auth/core/context";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { getMigrations } from "better-auth/db/migration";
import { getHttpTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import type {
	SCIMAuthenticationOptions,
	SCIMConnectionOptions,
	SCIMProjection,
	SCIMScope,
} from "./configuration";
import { scim } from "./index";

const ALL_SCOPES = [
	"scim.users.read",
	"scim.users.write",
	"scim.groups.read",
	"scim.groups.write",
] as const satisfies readonly SCIMScope[];

const MANAGED_ENDPOINTS = [
	"createSCIMManagedConnection",
	"listSCIMManagedConnections",
	"getSCIMManagedConnection",
	"rotateSCIMManagedCredential",
	"revokeSCIMManagedCredential",
	"decommissionSCIMManagedConnection",
	"listSCIMManagedConnectionEvents",
] as const;

let creationRequestSequence = 0;

function createCreationRequestId(): string {
	creationRequestSequence += 1;
	return `managed-connection-test-request-${creationRequestSequence}`;
}

async function createManagedInstance(
	registerCleanup: (cleanup: () => void | Promise<void>) => void,
	options: {
		maxActiveCredentials?: number;
		lastUsedWriteIntervalSeconds?: number;
		connections?: readonly SCIMConnectionOptions[];
		verifyBearerToken?: SCIMAuthenticationOptions["verifyBearerToken"];
		projection?: SCIMProjection;
	} = {},
) {
	const {
		connections = [],
		verifyBearerToken,
		projection,
		maxActiveCredentials,
		lastUsedWriteIntervalSeconds,
	} = options;
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
					connections,
					managedConnections: {
						credentialHashSecret: "managed-test-secret-at-least-32-characters",
						...(maxActiveCredentials !== undefined
							? { maxActiveCredentials }
							: {}),
						...(lastUsedWriteIntervalSeconds !== undefined
							? { lastUsedWriteIntervalSeconds }
							: {}),
					},
					...(verifyBearerToken
						? { authentication: { verifyBearerToken } }
						: {}),
					...(projection ? { projection } : {}),
				}),
			],
		},
		{ disableTestUser: true, testWith: "sqlite" },
	);
	await (await getMigrations(instance.auth.options)).runMigrations();
	registerCleanup(async () => {
		await instance.server.close();
		sqlite.close();
	});
	return instance;
}

function scimHeaders(token: string): HeadersInit {
	return {
		accept: "application/scim+json",
		authorization: `Bearer ${token}`,
		"content-type": "application/scim+json",
	};
}

async function createUser(
	baseURL: string,
	token: string,
	userName: string,
): Promise<Response> {
	return await fetch(`${baseURL}/api/auth/scim/v2/Users`, {
		method: "POST",
		headers: scimHeaders(token),
		body: JSON.stringify({
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
			userName,
		}),
	});
}

async function listUsers(baseURL: string, token: string): Promise<Response> {
	return await fetch(`${baseURL}/api/auth/scim/v2/Users`, {
		headers: scimHeaders(token),
	});
}

describe("SCIM managed connections", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("creates, lists, and gets a tenant-scoped connection without storing its token", async ({
		onTestFinished,
	}) => {
		const instance = await createManagedInstance(onTestFinished);
		const api = instance.auth.api as unknown as Record<
			string,
			{ path?: string }
		>;
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
		const rawCreationRequestId = `  ${createCreationRequestId()}  `;
		const creationRequestId = rawCreationRequestId.trim();

		const created = await instance.auth.api.createSCIMManagedConnection({
			body: {
				creationRequestId: rawCreationRequestId,
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt,
			},
		});
		const listed = await instance.auth.api.listSCIMManagedConnections({
			body: { provisioningDomainId: "organization-acme" },
		});
		const fetched = await instance.auth.api.getSCIMManagedConnection({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
			},
		});
		const otherTenant = await instance.auth.api.listSCIMManagedConnections({
			body: { provisioningDomainId: "organization-other" },
		});
		const events = await instance.auth.api.listSCIMManagedConnectionEvents({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
			},
		});
		const rows = await instance.db.findMany<Record<string, unknown>>({
			model: "scimManagedCredential",
			where: [],
		});

		expect(created.connection.connectionId).toMatch(
			/^ba_scim_connection_[A-Za-z0-9_-]+$/,
		);
		expect(created.connection.creationRequestId).toBe(creationRequestId);
		expect(created.credential.credentialId).toMatch(
			/^ba_scim_credential_[A-Za-z0-9_-]+$/,
		);
		expect(created.token).toMatch(
			new RegExp(`^${created.credential.credentialId}\\.[A-Za-z0-9_-]+$`),
		);
		expect(created.credential).toMatchObject({
			status: "active",
			scopes: ALL_SCOPES,
			expiresAt,
			createdBy: "admin-acme",
		});
		expect(listed).toEqual({ connections: [created.connection] });
		expect(fetched.connection).toEqual(created.connection);
		expect(fetched.credentials).toEqual([created.credential]);
		expect(events.events).toHaveLength(2);
		for (const event of events.events) {
			expect(event).not.toHaveProperty("creationRequestId");
		}
		expect(otherTenant).toEqual({ connections: [] });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			credentialId: created.credential.credentialId,
			hashVersion: "v1",
			status: "active",
		});
		expect(rows[0]).not.toHaveProperty("token");
		expect(rows[0]).not.toHaveProperty("secret");
		expect(rows[0]?.tokenDigest).toEqual(expect.any(String));
		expect(rows[0]?.tokenDigest).not.toContain(created.token.split(".").at(-1));
		for (const endpointName of MANAGED_ENDPOINTS) {
			expect(api[endpointName]).toBeTypeOf("function");
			expect(
				api[endpointName]?.path,
				`${endpointName} must not carry a routable path`,
			).toBeFalsy();
		}
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("joins an ambient transaction for create, rotate, and revoke", async ({
		onTestFinished,
	}) => {
		const instance = await createManagedInstance(onTestFinished);
		const context = await instance.auth.$context;
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
		const createBody = {
			creationRequestId: createCreationRequestId(),
			provisioningDomainId: "organization-acme",
			actorId: "admin-acme",
			scopes: ALL_SCOPES,
			expiresAt,
		};

		await expect(
			runWithTransaction(context.adapter, async () => {
				await instance.auth.api.createSCIMManagedConnection({
					body: createBody,
				});
				throw new Error("rollback managed create");
			}),
		).rejects.toThrow("rollback managed create");
		expect(
			await instance.db.findMany({
				model: "scimManagedConnection",
				where: [],
			}),
		).toEqual([]);
		expect(
			await instance.db.findMany({
				model: "scimManagedCredential",
				where: [],
			}),
		).toEqual([]);
		expect(
			await instance.db.findMany({
				model: "scimManagedConnectionEvent",
				where: [],
			}),
		).toEqual([]);

		const created = await instance.auth.api.createSCIMManagedConnection({
			body: createBody,
		});
		const baseline = await instance.auth.api.getSCIMManagedConnection({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: created.connection.provisioningDomainId,
			},
		});
		const baselineEvents =
			await instance.auth.api.listSCIMManagedConnectionEvents({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: created.connection.provisioningDomainId,
				},
			});

		await expect(
			runWithTransaction(context.adapter, async () => {
				const rotated = await instance.auth.api.rotateSCIMManagedCredential({
					body: {
						connectionId: created.connection.connectionId,
						provisioningDomainId: created.connection.provisioningDomainId,
						actorId: "admin-acme",
						scopes: ALL_SCOPES,
						expiresAt,
					},
				});
				expect(rotated.credential.status).toBe("active");
				throw new Error("rollback managed rotation");
			}),
		).rejects.toThrow("rollback managed rotation");
		expect(
			await instance.auth.api.getSCIMManagedConnection({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: created.connection.provisioningDomainId,
				},
			}),
		).toEqual(baseline);
		expect(
			await instance.auth.api.listSCIMManagedConnectionEvents({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: created.connection.provisioningDomainId,
				},
			}),
		).toEqual(baselineEvents);

		await expect(
			runWithTransaction(context.adapter, async () => {
				const revoked = await instance.auth.api.revokeSCIMManagedCredential({
					body: {
						connectionId: created.connection.connectionId,
						provisioningDomainId: created.connection.provisioningDomainId,
						credentialId: created.credential.credentialId,
						actorId: "admin-acme",
					},
				});
				expect(revoked.credentials).toEqual([
					expect.objectContaining({ status: "revoked" }),
				]);
				throw new Error("rollback managed revocation");
			}),
		).rejects.toThrow("rollback managed revocation");
		expect(
			await instance.auth.api.getSCIMManagedConnection({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: created.connection.provisioningDomainId,
				},
			}),
		).toEqual(baseline);
		expect(
			await instance.auth.api.listSCIMManagedConnectionEvents({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: created.connection.provisioningDomainId,
				},
			}),
		).toEqual(baselineEvents);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10592
	 */
	it("joins an ambient transaction for decommission without deadlocking", async ({
		onTestFinished,
	}) => {
		const instance = await createManagedInstance(onTestFinished);
		const context = await instance.auth.$context;
		const created = await instance.auth.api.createSCIMManagedConnection({
			body: {
				creationRequestId: createCreationRequestId(),
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
			},
		});
		const baseline = await instance.auth.api.getSCIMManagedConnection({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: created.connection.provisioningDomainId,
			},
		});
		const baselineEvents =
			await instance.auth.api.listSCIMManagedConnectionEvents({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: created.connection.provisioningDomainId,
				},
			});

		await expect(
			runWithTransaction(context.adapter, async () => {
				const decommissioned =
					await instance.auth.api.decommissionSCIMManagedConnection({
						body: {
							connectionId: created.connection.connectionId,
							provisioningDomainId: created.connection.provisioningDomainId,
							actorId: "admin-acme",
						},
					});
				expect(decommissioned.connection.status).toBe("decommissioned");
				throw new Error("rollback managed decommission");
			}),
		).rejects.toThrow("rollback managed decommission");
		expect(
			await instance.auth.api.getSCIMManagedConnection({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: created.connection.provisioningDomainId,
				},
			}),
		).toEqual(baseline);
		expect(
			await instance.auth.api.listSCIMManagedConnectionEvents({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: created.connection.provisioningDomainId,
				},
			}),
		).toEqual(baselineEvents);

		const decommissioned =
			await instance.auth.api.decommissionSCIMManagedConnection({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: created.connection.provisioningDomainId,
					actorId: "admin-acme",
				},
			});
		expect(decommissioned.connection.status).toBe("decommissioned");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("uses the native adapter transaction when no ambient transaction exists", async ({
		onTestFinished,
	}) => {
		const instance = await createManagedInstance(onTestFinished);
		const context = await instance.auth.$context;
		type TestTransaction = {
			create: (input: { model: string }) => Promise<unknown>;
		};
		type TestAdapter = {
			transaction: (
				callback: (transaction: TestTransaction) => Promise<unknown>,
			) => Promise<unknown>;
		};
		const adapter = context.adapter as unknown as TestAdapter;
		const originalTransaction = adapter.transaction;
		let transactionCalls = 0;
		adapter.transaction = async (callback) => {
			transactionCalls += 1;
			return await originalTransaction(async (transaction) => {
				const originalCreate = transaction.create;
				const failingTransaction: TestTransaction = {
					...transaction,
					create: async (input) => {
						if (input.model === "scimManagedConnectionEvent") {
							throw new Error("simulated managed event failure");
						}
						return await originalCreate(input);
					},
				};
				return await callback(failingTransaction);
			});
		};
		try {
			await expect(
				instance.auth.api.createSCIMManagedConnection({
					body: {
						creationRequestId: createCreationRequestId(),
						provisioningDomainId: "organization-acme",
						actorId: "admin-acme",
						scopes: ALL_SCOPES,
						expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
					},
				}),
			).rejects.toThrow("simulated managed event failure");
		} finally {
			adapter.transaction = originalTransaction;
		}

		expect(transactionCalls).toBe(1);
		for (const model of [
			"scimManagedConnection",
			"scimManagedCredential",
			"scimManagedConnectionEvent",
		]) {
			expect(await instance.db.findMany({ model, where: [] })).toEqual([]);
		}
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("requires a bounded creation request ID and atomically rejects duplicate creation", async ({
		onTestFinished,
	}) => {
		const instance = await createManagedInstance(onTestFinished);
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
		const validBody = {
			creationRequestId: "managed-duplicate-request",
			provisioningDomainId: "organization-acme",
			actorId: "admin-acme",
			scopes: ALL_SCOPES,
			expiresAt,
		};

		await expect(
			instance.auth.api.createSCIMManagedConnection({
				// @ts-expect-error creationRequestId is required.
				body: {
					provisioningDomainId: "organization-acme",
					actorId: "admin-acme",
					scopes: ALL_SCOPES,
					expiresAt,
				},
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		for (const creationRequestId of [
			"too-short",
			"x".repeat(256),
			"                ",
		]) {
			await expect(
				instance.auth.api.createSCIMManagedConnection({
					body: { ...validBody, creationRequestId },
				}),
			).rejects.toMatchObject({ statusCode: 400 });
		}

		const results = await Promise.allSettled([
			instance.auth.api.createSCIMManagedConnection({ body: validBody }),
			instance.auth.api.createSCIMManagedConnection({ body: validBody }),
		]);
		const fulfilled = results.filter((result) => result.status === "fulfilled");
		const rejected = results.filter((result) => result.status === "rejected");
		const connections = await instance.db.findMany<Record<string, unknown>>({
			model: "scimManagedConnection",
			where: [],
		});
		const credentials = await instance.db.findMany<Record<string, unknown>>({
			model: "scimManagedCredential",
			where: [],
		});
		const events = await instance.db.findMany<Record<string, unknown>>({
			model: "scimManagedConnectionEvent",
			where: [],
		});

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0]).toMatchObject({
			reason: {
				statusCode: 409,
				body: {
					code: "SCIM_MANAGED_CREATION_REQUEST_ID_CONFLICT",
				},
			},
		});
		expect(rejected[0]).not.toHaveProperty("reason.token");
		expect(connections).toHaveLength(1);
		expect(connections[0]).toMatchObject({
			creationRequestId: validBody.creationRequestId,
		});
		expect(credentials).toHaveLength(1);
		expect(
			events.filter((event) => event.type === "connection.created"),
		).toHaveLength(1);
		expect(events).toHaveLength(2);

		const context = await (
			instance.auth as unknown as {
				$context: Promise<{
					adapter: {
						transaction: (
							callback: (transaction: unknown) => Promise<unknown>,
						) => Promise<unknown>;
					};
				}>;
			}
		).$context;
		const originalTransaction = context.adapter.transaction;
		const unrelatedAdapterError = new Error("unrelated adapter failure");
		context.adapter.transaction = async () => {
			throw unrelatedAdapterError;
		};
		try {
			await expect(
				instance.auth.api.createSCIMManagedConnection({
					body: {
						...validBody,
						creationRequestId: "unrelated-error-request-id",
					},
				}),
			).rejects.toBe(unrelatedAdapterError);
		} finally {
			context.adapter.transaction = originalTransaction;
		}
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("authenticates generated tokens, overlaps rotation, revokes immediately, and throttles last-used writes", async ({
		onTestFinished,
	}) => {
		const instance = await createManagedInstance(onTestFinished, {
			lastUsedWriteIntervalSeconds: 3600,
		});
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
		const created = await instance.auth.api.createSCIMManagedConnection({
			body: {
				creationRequestId: createCreationRequestId(),
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt,
			},
		});

		const provisioned = await createUser(
			instance.baseURL,
			created.token,
			"managed@example.com",
		);
		const credentialAfterFirstUse = await instance.db.findOne<
			Record<string, unknown>
		>({
			model: "scimManagedCredential",
			where: [
				{
					field: "credentialId",
					value: created.credential.credentialId,
				},
			],
		});
		const listedWithOld = await listUsers(instance.baseURL, created.token);
		const credentialAfterSecondUse = await instance.db.findOne<
			Record<string, unknown>
		>({
			model: "scimManagedCredential",
			where: [
				{
					field: "credentialId",
					value: created.credential.credentialId,
				},
			],
		});
		const rotated = await instance.auth.api.rotateSCIMManagedCredential({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt,
			},
		});
		const oldDuringOverlap = await listUsers(instance.baseURL, created.token);
		const newDuringOverlap = await listUsers(instance.baseURL, rotated.token);
		const revoked = await instance.auth.api.revokeSCIMManagedCredential({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
				credentialId: created.credential.credentialId,
				actorId: "admin-acme",
			},
		});
		const oldAfterRevoke = await listUsers(instance.baseURL, created.token);
		const newAfterRevoke = await listUsers(instance.baseURL, rotated.token);
		const events = await instance.auth.api.listSCIMManagedConnectionEvents({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
			},
		});

		expect(provisioned.status).toBe(201);
		expect(listedWithOld.status).toBe(200);
		expect(credentialAfterFirstUse?.lastUsedAt).toEqual(expect.any(Date));
		expect(credentialAfterSecondUse?.lastUsedAt).toEqual(
			credentialAfterFirstUse?.lastUsedAt,
		);
		expect(rotated.token).not.toBe(created.token);
		expect(oldDuringOverlap.status).toBe(200);
		expect(newDuringOverlap.status).toBe(200);
		expect(revoked.credentials).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					credentialId: created.credential.credentialId,
					status: "revoked",
				}),
				expect.objectContaining({
					credentialId: rotated.credential.credentialId,
					status: "active",
				}),
			]),
		);
		expect(oldAfterRevoke.status).toBe(401);
		expect(newAfterRevoke.status).toBe(200);
		expect(events.events.map((event) => event.type)).toEqual([
			"connection.created",
			"credential.issued",
			"credential.rotated",
			"credential.revoked",
		]);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("decommissions managed credentials before canonical reconciliation and remains retry-safe", async ({
		onTestFinished,
	}) => {
		const instance = await createManagedInstance(onTestFinished);
		const created = await instance.auth.api.createSCIMManagedConnection({
			body: {
				creationRequestId: createCreationRequestId(),
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
			},
		});
		expect(
			await createUser(
				instance.baseURL,
				created.token,
				"decommission@example.com",
			),
		).toMatchObject({ status: 201 });

		const first = await instance.auth.api.decommissionSCIMManagedConnection({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
			},
		});
		const repeated = await instance.auth.api.decommissionSCIMManagedConnection({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
			},
		});
		const rejected = await listUsers(instance.baseURL, created.token);
		const events = await instance.auth.api.listSCIMManagedConnectionEvents({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
			},
		});
		const binding = await instance.db.findOne<Record<string, unknown>>({
			model: "scimConnectionBinding",
			where: [
				{
					field: "connectionId",
					value: created.connection.connectionId,
				},
			],
		});

		expect(first.connection.status).toBe("decommissioned");
		expect(first.credentials).toEqual([
			expect.objectContaining({ status: "decommissioned" }),
		]);
		expect(first.decommission.status).toBe("complete");
		expect(repeated.connection).toEqual(first.connection);
		expect(rejected.status).toBe(401);
		expect(events.events.map((event) => event.type)).toEqual([
			"connection.created",
			"credential.issued",
			"connection.decommissioning",
			"connection.decommissioned",
		]);
		expect(binding).toMatchObject({
			connectionId: created.connection.connectionId,
			provisioningDomainId: "organization-acme",
			decommissionStatus: "complete",
		});
		await expect(
			instance.auth.api.rotateSCIMManagedCredential({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: "organization-acme",
					actorId: "admin-acme",
					scopes: ALL_SCOPES,
					expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
				},
			}),
		).rejects.toMatchObject({ statusCode: 409 });
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("uses tenant-qualified not-found behavior and atomically enforces active credential slots", async ({
		onTestFinished,
	}) => {
		const instance = await createManagedInstance(onTestFinished, {
			maxActiveCredentials: 2,
		});
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
		const created = await instance.auth.api.createSCIMManagedConnection({
			body: {
				creationRequestId: createCreationRequestId(),
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt,
			},
		});
		const rotateBody = {
			connectionId: created.connection.connectionId,
			provisioningDomainId: "organization-acme",
			actorId: "admin-acme",
			scopes: ALL_SCOPES,
			expiresAt,
		};
		const rotations = await Promise.allSettled([
			instance.auth.api.rotateSCIMManagedCredential({ body: rotateBody }),
			instance.auth.api.rotateSCIMManagedCredential({ body: rotateBody }),
		]);
		const credentials = await instance.db.findMany<Record<string, unknown>>({
			model: "scimManagedCredential",
			where: [
				{ field: "status", value: "active" },
				{ field: "expiresAt", value: new Date(), operator: "gt" },
			],
		});
		const wrongDomain = instance.auth.api.getSCIMManagedConnection({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-other",
			},
		});
		const unknownConnection = instance.auth.api.getSCIMManagedConnection({
			body: {
				connectionId: "ba_scim_connection_missing",
				provisioningDomainId: "organization-other",
			},
		});

		expect(
			rotations.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			rotations.filter((result) => result.status === "rejected"),
		).toHaveLength(1);
		expect(credentials).toHaveLength(2);
		expect(new Set(credentials.map((row) => row.activeSlotKey)).size).toBe(2);
		await expect(wrongDomain).rejects.toMatchObject({
			statusCode: 404,
			message: "Managed SCIM connection not found",
		});
		await expect(unknownConnection).rejects.toMatchObject({
			statusCode: 404,
			message: "Managed SCIM connection not found",
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("keeps the managed bearer namespace catalog-only while preserving static-first dispatch", async ({
		onTestFinished,
	}) => {
		let verifierCalls = 0;
		const staticToken = "ba_scim_credential_static-credential.static-secret";
		const instance = await createManagedInstance(onTestFinished, {
			connections: [
				{
					id: "static-connection",
					credentials: [
						{
							type: "bearer",
							id: "static-credential",
							token: staticToken,
						},
					],
				},
			],
			verifyBearerToken({ token }) {
				verifierCalls++;
				if (token !== "application-token") return null;
				return {
					connection: {
						id: "ba_scim_connection_application-collision",
						provisioningDomainId: "organization-acme",
					},
					credentialId: "application-credential",
					scopes: ALL_SCOPES,
				};
			},
		});

		const staticResponse = await listUsers(instance.baseURL, staticToken);
		const unknownManaged = await listUsers(
			instance.baseURL,
			"ba_scim_credential_unknown.unknown-secret",
		);
		const applicationCollision = await listUsers(
			instance.baseURL,
			"application-token",
		);

		expect(staticResponse.status).toBe(200);
		expect(unknownManaged.status).toBe(401);
		expect(verifierCalls).toBe(1);
		expect(applicationCollision.status).toBe(401);
		expect(() =>
			scim({
				connections: [
					{
						id: "ba_scim_connection_static-collision",
						credentials: [
							{
								type: "bearer",
								id: "credential",
								token: "ordinary-static-token",
							},
						],
					},
				],
				managedConnections: {
					credentialHashSecret: "managed-test-secret-at-least-32-characters",
				},
			}),
		).toThrow("cannot use the reserved");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("enforces explicit future expiry and exact scopes at issuance and request time", async ({
		onTestFinished,
	}) => {
		const instance = await createManagedInstance(onTestFinished);
		await expect(
			instance.auth.api.createSCIMManagedConnection({
				body: {
					creationRequestId: createCreationRequestId(),
					provisioningDomainId: "organization-acme",
					actorId: "admin-acme",
					scopes: ALL_SCOPES,
					expiresAt: new Date(Date.now() - 1),
				},
			}),
		).rejects.toMatchObject({ statusCode: 400 });

		const created = await instance.auth.api.createSCIMManagedConnection({
			body: {
				creationRequestId: createCreationRequestId(),
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ["scim.users.read"],
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
			},
		});
		const readAllowed = await listUsers(instance.baseURL, created.token);
		const writeDenied = await createUser(
			instance.baseURL,
			created.token,
			"scope-denied@example.com",
		);
		await instance.db.update({
			model: "scimManagedCredential",
			where: [
				{
					field: "credentialId",
					value: created.credential.credentialId,
				},
			],
			update: { expiresAt: new Date(Date.now() - 1) },
		});
		const expired = await listUsers(instance.baseURL, created.token);

		expect(readAllowed.status).toBe(200);
		expect(writeDenied.status).toBe(403);
		expect(expired.status).toBe(401);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("reclaims expired slots and never exceeds the cap during rotate-revoke races", async ({
		onTestFinished,
	}) => {
		const instance = await createManagedInstance(onTestFinished, {
			maxActiveCredentials: 2,
		});
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
		const created = await instance.auth.api.createSCIMManagedConnection({
			body: {
				creationRequestId: createCreationRequestId(),
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt,
			},
		});
		const second = await instance.auth.api.rotateSCIMManagedCredential({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt,
			},
		});
		await instance.db.update({
			model: "scimManagedCredential",
			where: [
				{
					field: "credentialId",
					value: created.credential.credentialId,
				},
			],
			update: { expiresAt: new Date(Date.now() - 1) },
		});
		const replacement = await instance.auth.api.rotateSCIMManagedCredential({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt,
			},
		});
		await Promise.allSettled([
			instance.auth.api.revokeSCIMManagedCredential({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: "organization-acme",
					credentialId: second.credential.credentialId,
					actorId: "admin-acme",
				},
			}),
			instance.auth.api.rotateSCIMManagedCredential({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: "organization-acme",
					actorId: "admin-acme",
					scopes: ALL_SCOPES,
					expiresAt,
				},
			}),
		]);
		const credentials = await instance.db.findMany<Record<string, unknown>>({
			model: "scimManagedCredential",
			where: [],
		});
		const live = credentials.filter(
			(credential) =>
				credential.status === "active" &&
				credential.expiresAt instanceof Date &&
				credential.expiresAt.getTime() > Date.now(),
		);
		const original = credentials.find(
			(credential) =>
				credential.credentialId === created.credential.credentialId,
		);

		expect(replacement.token).not.toBe(created.token);
		expect(original).toMatchObject({ status: "expired" });
		expect(original?.activeSlotKey).toBe(
			`${created.credential.credentialId}:inactive`,
		);
		expect(live.length).toBeLessThanOrEqual(2);
		expect(
			new Set(live.map((credential) => credential.activeSlotKey)).size,
		).toBe(live.length);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("enforces a reduced active credential cap across existing slot layouts", async ({
		onTestFinished,
	}) => {
		const instance = await createManagedInstance(onTestFinished, {
			maxActiveCredentials: 2,
		});
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
		const created = await instance.auth.api.createSCIMManagedConnection({
			body: {
				creationRequestId: createCreationRequestId(),
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt,
			},
		});
		const second = await instance.auth.api.rotateSCIMManagedCredential({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt,
			},
		});
		const connection = await instance.db.findOne<Record<string, unknown>>({
			model: "scimManagedConnection",
			where: [
				{
					field: "connectionId",
					value: created.connection.connectionId,
				},
			],
		});
		expect(connection?.id).toEqual(expect.any(String));
		await instance.db.update({
			model: "scimManagedCredential",
			where: [
				{
					field: "credentialId",
					value: created.credential.credentialId,
				},
			],
			update: { activeSlotKey: `${connection?.id}:active:3` },
		});
		await instance.db.update({
			model: "scimManagedCredential",
			where: [
				{
					field: "credentialId",
					value: second.credential.credentialId,
				},
			],
			update: { activeSlotKey: `${connection?.id}:active:4` },
		});

		await expect(
			instance.auth.api.rotateSCIMManagedCredential({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: "organization-acme",
					actorId: "admin-acme",
					scopes: ALL_SCOPES,
					expiresAt,
				},
			}),
		).rejects.toMatchObject({
			statusCode: 409,
			message:
				"Managed SCIM connection has the maximum number of active credentials",
		});
		const active = await instance.db.findMany<Record<string, unknown>>({
			model: "scimManagedCredential",
			where: [{ field: "status", value: "active" }],
		});
		expect(active).toHaveLength(2);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("keeps credentials disabled after a canonical decommission failure and completes on retry", async ({
		onTestFinished,
	}) => {
		let failDecommission = false;
		const instance = await createManagedInstance(onTestFinished, {
			projection: {
				reconcileUser() {
					if (failDecommission) {
						throw new Error("simulated projection interruption");
					}
				},
			},
		});
		const created = await instance.auth.api.createSCIMManagedConnection({
			body: {
				creationRequestId: createCreationRequestId(),
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
				scopes: ALL_SCOPES,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
			},
		});
		expect(
			await createUser(instance.baseURL, created.token, "retry@example.com"),
		).toMatchObject({ status: 201 });

		failDecommission = true;
		await expect(
			instance.auth.api.decommissionSCIMManagedConnection({
				body: {
					connectionId: created.connection.connectionId,
					provisioningDomainId: "organization-acme",
					actorId: "admin-acme",
				},
			}),
		).rejects.toThrow("SCIM projection reconciliation failed");
		const interrupted = await instance.auth.api.getSCIMManagedConnection({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
			},
		});
		const rejected = await listUsers(instance.baseURL, created.token);

		failDecommission = false;
		const retried = await instance.auth.api.decommissionSCIMManagedConnection({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId: "organization-acme",
				actorId: "admin-acme",
			},
		});

		expect(interrupted.connection.status).toBe("decommissioning");
		expect(interrupted.credentials).toEqual([
			expect.objectContaining({ status: "decommissioned" }),
		]);
		expect(rejected.status).toBe(401);
		expect(retried.connection.status).toBe("decommissioned");
		expect(retried.decommission.status).toBe("complete");
	});

	it("rejects unsafe managed catalog configuration before startup", () => {
		expect(() =>
			scim({
				connections: [],
				managedConnections: { credentialHashSecret: "too-short" },
			}),
		).toThrow(
			"SCIM managed credentialHashSecret must contain at least 32 characters.",
		);
		expect(() =>
			scim({
				connections: [],
				managedConnections: {
					credentialHashSecret: "managed-test-secret-at-least-32-characters",
					maxActiveCredentials: 0,
				},
			}),
		).toThrow(
			"SCIM managed maxActiveCredentials must be an integer between 1 and 100.",
		);
		expect(() =>
			scim({
				connections: [],
				managedConnections: {
					credentialHashSecret: "managed-test-secret-at-least-32-characters",
					lastUsedWriteIntervalSeconds: -1,
				},
			}),
		).toThrow(
			"SCIM managed lastUsedWriteIntervalSeconds must be a non-negative integer.",
		);
	});
});
