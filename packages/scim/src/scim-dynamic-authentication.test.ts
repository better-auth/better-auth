import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { getMigrations } from "better-auth/db/migration";
import { getHttpTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import type { SCIMAuthenticationOptions, SCIMBearerTokenVerification } from ".";
import { scim } from ".";
import type { SCIMConnectionOptions, SCIMScope } from "./configuration";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";

interface DynamicCredential {
	id: string;
	tokenHash: string;
	connectionId: string;
	provisioningDomainId: string;
	credentialId: string;
	scopes: string;
	status: "active" | "revoked";
	expiresAt?: Date | null;
	lastAuthenticatedAt?: Date | null;
}

type VerificationOverride = unknown | Error;

const dynamicCredentialPlugin = {
	id: "scim-dynamic-authentication-test",
	schema: {
		testSCIMCredential: {
			fields: {
				tokenHash: { type: "string", required: true, unique: true },
				connectionId: { type: "string", required: true },
				provisioningDomainId: { type: "string", required: true },
				credentialId: { type: "string", required: true },
				scopes: { type: "string", required: true },
				status: { type: "string", required: true },
				expiresAt: { type: "date", required: false },
				lastAuthenticatedAt: { type: "date", required: false },
			},
		},
	},
} as const;

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

async function createDynamicInstance(
	registerCleanup: (cleanup: () => void | Promise<void>) => void,
	options: {
		connections?: readonly SCIMConnectionOptions[];
		overrides?: ReadonlyMap<string, VerificationOverride>;
		afterCredentialAccepted?: (
			credential: DynamicCredential,
		) => void | Promise<void>;
	} = {},
) {
	const sqlite = new DatabaseSync(":memory:");
	let verifierDatabaseCapabilities: string[] = [];
	const instance = await getHttpTestInstance(
		{
			database: {
				dialect: new NodeSqliteDialect({ database: sqlite }),
				type: "sqlite",
				transaction: true,
			},
			plugins: [
				dynamicCredentialPlugin,
				scim({
					connections: options.connections ?? [],
					authentication: {
						async verifyBearerToken({ token }, context) {
							verifierDatabaseCapabilities = Object.keys(
								context.database,
							).sort();
							const override = options.overrides?.get(token);
							if (override instanceof Error) throw override;
							if (override !== undefined) {
								return override as SCIMBearerTokenVerification;
							}

							const credential =
								await context.database.findOne<DynamicCredential>({
									model: "testSCIMCredential",
									where: [{ field: "tokenHash", value: hashToken(token) }],
								});
							if (!credential) return null;
							if (credential.status !== "active") return null;
							if (
								credential.expiresAt &&
								credential.expiresAt.getTime() <= Date.now()
							) {
								return null;
							}
							await options.afterCredentialAccepted?.(credential);
							await context.database.update({
								model: "testSCIMCredential",
								where: [{ field: "id", value: credential.id }],
								update: { lastAuthenticatedAt: new Date() },
							});
							return {
								connection: {
									id: credential.connectionId,
									provisioningDomainId: credential.provisioningDomainId,
								},
								credentialId: credential.credentialId,
								scopes: JSON.parse(credential.scopes) as SCIMScope[],
								...(credential.expiresAt
									? { expiresAt: credential.expiresAt }
									: {}),
							};
						},
					},
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
	return Object.assign(instance, {
		getVerifierDatabaseCapabilities: () => verifierDatabaseCapabilities,
	});
}

async function addCredential(
	instance: Awaited<ReturnType<typeof createDynamicInstance>>,
	input: {
		token: string;
		connectionId: string;
		provisioningDomainId: string;
		credentialId?: string;
		scopes?: readonly SCIMScope[];
		expiresAt?: Date;
	},
): Promise<DynamicCredential> {
	return instance.db.create<Omit<DynamicCredential, "id">, DynamicCredential>({
		model: "testSCIMCredential",
		data: {
			tokenHash: hashToken(input.token),
			connectionId: input.connectionId,
			provisioningDomainId: input.provisioningDomainId,
			credentialId: input.credentialId ?? `${input.connectionId}-credential`,
			scopes: JSON.stringify(
				input.scopes ?? [
					"scim.users.read",
					"scim.users.write",
					"scim.groups.read",
					"scim.groups.write",
				],
			),
			status: "active",
			...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
		},
	});
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
	input: { userName: string; externalId?: string },
): Promise<{ response: Response; body: Record<string, unknown> }> {
	const response = await fetch(`${baseURL}/api/auth/scim/v2/Users`, {
		method: "POST",
		headers: scimHeaders(token),
		body: JSON.stringify({ schemas: [USER_SCHEMA], ...input }),
	});
	return {
		response,
		body: (await response.json()) as Record<string, unknown>,
	};
}

async function listUsers(
	baseURL: string,
	token: string,
): Promise<{
	response: Response;
	body: { totalResults: number; Resources: Record<string, unknown>[] };
}> {
	const response = await fetch(`${baseURL}/api/auth/scim/v2/Users`, {
		headers: scimHeaders(token),
	});
	return {
		response,
		body: (await response.json()) as {
			totalResults: number;
			Resources: Record<string, unknown>[];
		},
	};
}

describe("SCIM dynamic connection authentication", () => {
	it("allows a dynamic-only connection resolver", () => {
		expect(() => scim({ connections: [] })).toThrow(
			"The scim plugin requires a provisioning connection, bearer token verifier, or managed connection catalog.",
		);
		expect(() =>
			scim({
				connections: [],
				authentication: {
					verifyBearerToken() {
						return null;
					},
				},
			}),
		).not.toThrow();
	});

	it("rejects malformed authentication options at construction", () => {
		const missingVerifier = {} as unknown as SCIMAuthenticationOptions;
		const nullAuthentication = null as unknown as SCIMAuthenticationOptions;
		const expectedError =
			"SCIM authentication requires a callable verifyBearerToken.";

		expect(() =>
			scim({
				connections: [],
				authentication: missingVerifier,
			}),
		).toThrow(expectedError);
		expect(() =>
			scim({
				connections: [{ id: "dynamic-only", credentials: [] }],
				authentication: nullAuthentication,
			}),
		).toThrow(expectedError);
		expect(() =>
			scim({
				connections: [
					{
						id: "static-connection",
						credentials: [
							{
								type: "bearer",
								id: "static-credential",
								token: "static-token",
							},
						],
					},
				],
				authentication: missingVerifier,
			}),
		).toThrow(expectedError);
	});

	it("resolves application-owned credentials and isolates equal external IDs over HTTP", async ({
		onTestFinished,
	}) => {
		const instance = await createDynamicInstance(onTestFinished);
		await addCredential(instance, {
			token: "tenant-a-token",
			connectionId: "dynamic-tenant-a",
			provisioningDomainId: "workspace-a",
		});
		await addCredential(instance, {
			token: "tenant-b-token",
			connectionId: "dynamic-tenant-b",
			provisioningDomainId: "workspace-b",
		});

		const tenantA = await createUser(instance.baseURL, "tenant-a-token", {
			userName: "employee-a@example.com",
			externalId: "shared-directory-user",
		});
		const tenantB = await createUser(instance.baseURL, "tenant-b-token", {
			userName: "employee-b@example.com",
			externalId: "shared-directory-user",
		});
		const tenantAUsers = await listUsers(instance.baseURL, "tenant-a-token");
		const tenantBUsers = await listUsers(instance.baseURL, "tenant-b-token");
		const crossTenantPatch = await fetch(
			`${instance.baseURL}/api/auth/scim/v2/Users/${tenantB.body.id}`,
			{
				method: "PATCH",
				headers: scimHeaders("tenant-a-token"),
				body: JSON.stringify({
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [{ op: "replace", path: "active", value: false }],
				}),
			},
		);
		const tenantBResource = await fetch(
			`${instance.baseURL}/api/auth/scim/v2/Users/${tenantB.body.id}`,
			{ headers: scimHeaders("tenant-b-token") },
		);
		const tenantBResourceBody = (await tenantBResource.json()) as {
			active: boolean;
		};

		expect(tenantA.response.status).toBe(201);
		expect(tenantB.response.status).toBe(201);
		expect(tenantAUsers.response.status).toBe(200);
		expect(tenantBUsers.response.status).toBe(200);
		expect(crossTenantPatch.status).toBe(404);
		expect(tenantBResource.status).toBe(200);
		expect(tenantBResourceBody.active).toBe(true);
		expect(tenantAUsers.body).toMatchObject({
			totalResults: 1,
			Resources: [{ id: tenantA.body.id, externalId: "shared-directory-user" }],
		});
		expect(tenantBUsers.body).toMatchObject({
			totalResults: 1,
			Resources: [{ id: tenantB.body.id, externalId: "shared-directory-user" }],
		});
		expect(tenantAUsers.body.Resources).not.toContainEqual(
			expect.objectContaining({ id: tenantB.body.id }),
		);
		expect(tenantBUsers.body.Resources).not.toContainEqual(
			expect.objectContaining({ id: tenantA.body.id }),
		);

		const [bindings, scimUsers, subjects, accounts, credentials] =
			await Promise.all([
				instance.db.findMany<{
					connectionId: string;
					provisioningDomainId: string;
				}>({ model: "scimConnectionBinding", where: [] }),
				instance.db.findMany<{
					id: string;
					connectionId: string;
					provisioningDomainId: string;
					externalId: string;
					userId: string;
				}>({ model: "scimUser", where: [] }),
				instance.db.findMany<{
					userId: string;
					profileSourceId?: string;
				}>({ model: "scimSubject", where: [] }),
				instance.db.findMany({ model: "account", where: [] }),
				instance.db.findMany<DynamicCredential>({
					model: "testSCIMCredential",
					where: [],
				}),
			]);
		expect(bindings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					connectionId: "dynamic-tenant-a",
					provisioningDomainId: "workspace-a",
				}),
				expect.objectContaining({
					connectionId: "dynamic-tenant-b",
					provisioningDomainId: "workspace-b",
				}),
			]),
		);
		expect(bindings).toHaveLength(2);
		expect(scimUsers).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					connectionId: "dynamic-tenant-a",
					provisioningDomainId: "workspace-a",
					externalId: "shared-directory-user",
				}),
				expect.objectContaining({
					connectionId: "dynamic-tenant-b",
					provisioningDomainId: "workspace-b",
					externalId: "shared-directory-user",
				}),
			]),
		);
		expect(scimUsers).toHaveLength(2);
		expect(new Set(scimUsers.map(({ userId }) => userId)).size).toBe(2);
		expect(subjects).toHaveLength(2);
		expect(new Set(subjects.map(({ userId }) => userId)).size).toBe(2);
		expect(subjects.map(({ profileSourceId }) => profileSourceId)).toEqual(
			expect.arrayContaining(scimUsers.map(({ id }) => id)),
		);
		expect(accounts).toEqual([]);
		expect(credentials).toHaveLength(2);
		expect(
			credentials.every((credential) => credential.lastAuthenticatedAt),
		).toBe(true);
		expect(instance.getVerifierDatabaseCapabilities()).toEqual([
			"findOne",
			"update",
		]);
	});

	it("rejects unknown, malformed, ambiguous, and static-colliding resolutions before writes", async ({
		onTestFinished,
	}) => {
		const validFields = {
			credentialId: "dynamic-credential",
			scopes: ["scim.users.read"] as const,
		};
		const overrides = new Map<string, VerificationOverride>([
			[
				"malformed-token",
				{
					connection: {
						id: " dynamic-tenant ",
						provisioningDomainId: "workspace",
					},
					...validFields,
				},
			],
			[
				"ambiguous-token",
				{
					connectionId: "configured-tenant",
					connection: {
						id: "dynamic-tenant",
						provisioningDomainId: "workspace",
					},
					...validFields,
				},
			],
			[
				"missing-domain-token",
				{
					connection: { id: "dynamic-tenant" },
					...validFields,
				},
			],
			[
				"invalid-credential-token",
				{
					connection: {
						id: "dynamic-tenant",
						provisioningDomainId: "workspace",
					},
					credentialId: " invalid-credential ",
					scopes: ["scim.users.read"],
				},
			],
			[
				"empty-scopes-token",
				{
					connection: {
						id: "dynamic-tenant",
						provisioningDomainId: "workspace",
					},
					credentialId: "dynamic-credential",
					scopes: [],
				},
			],
			[
				"invalid-expiry-token",
				{
					connection: {
						id: "dynamic-tenant",
						provisioningDomainId: "workspace",
					},
					...validFields,
					expiresAt: "tomorrow",
				},
			],
			[
				"expired-result-token",
				{
					connection: {
						id: "dynamic-tenant",
						provisioningDomainId: "workspace",
					},
					...validFields,
					expiresAt: new Date(Date.now() - 60_000),
				},
			],
			[
				"unknown-configured-token",
				{
					connectionId: "missing-configured-tenant",
					...validFields,
				},
			],
			["missing-connection-token", validFields],
			[
				"colliding-token",
				{
					connection: {
						id: "configured-tenant",
						provisioningDomainId: "dynamic-workspace",
					},
					...validFields,
				},
			],
		]);
		const instance = await createDynamicInstance(onTestFinished, {
			connections: [{ id: "configured-tenant", credentials: [] }],
			overrides,
		});

		for (const token of [
			"unknown-token",
			"malformed-token",
			"ambiguous-token",
			"missing-domain-token",
			"invalid-credential-token",
			"empty-scopes-token",
			"invalid-expiry-token",
			"expired-result-token",
			"unknown-configured-token",
			"missing-connection-token",
			"colliding-token",
		]) {
			const result = await listUsers(instance.baseURL, token);
			expect(result.response.status, token).toBe(401);
			expect(result.response.headers.get("www-authenticate"), token).toBe(
				'Bearer realm="SCIM"',
			);
		}

		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual([]);
		expect(
			await instance.db.findMany({ model: "scimUser", where: [] }),
		).toEqual([]);
		expect(await instance.db.findMany({ model: "user", where: [] })).toEqual(
			[],
		);
	});

	it("checks dynamic credential scopes and expiry before binding or provisioning", async ({
		onTestFinished,
	}) => {
		const instance = await createDynamicInstance(onTestFinished);
		await addCredential(instance, {
			token: "read-only-token",
			connectionId: "read-only-tenant",
			provisioningDomainId: "read-only-workspace",
			scopes: ["scim.users.read"],
		});
		await addCredential(instance, {
			token: "expired-token",
			connectionId: "expired-tenant",
			provisioningDomainId: "expired-workspace",
			expiresAt: new Date(Date.now() - 60_000),
		});

		const insufficientScope = await createUser(
			instance.baseURL,
			"read-only-token",
			{ userName: "read-only@example.com" },
		);
		const expired = await createUser(instance.baseURL, "expired-token", {
			userName: "expired@example.com",
		});

		expect(insufficientScope.response.status).toBe(403);
		expect(expired.response.status).toBe(401);
		expect(expired.response.headers.get("www-authenticate")).toBe(
			'Bearer realm="SCIM"',
		);
		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual([]);
		expect(
			await instance.db.findMany({ model: "scimUser", where: [] }),
		).toEqual([]);
		expect(await instance.db.findMany({ model: "user", where: [] })).toEqual(
			[],
		);
		const expiredCredential = await instance.db.findOne<DynamicCredential>({
			model: "testSCIMCredential",
			where: [{ field: "tokenHash", value: hashToken("expired-token") }],
		});
		expect(expiredCredential?.lastAuthenticatedAt ?? null).toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("applies dynamic credential revocation prospectively to real HTTP requests", async ({
		onTestFinished,
	}) => {
		let markCredentialAccepted: (() => void) | undefined;
		let releaseAcceptedRequest: (() => void) | undefined;
		const credentialAccepted = new Promise<void>((resolve) => {
			markCredentialAccepted = resolve;
		});
		const acceptedRequestMayContinue = new Promise<void>((resolve) => {
			releaseAcceptedRequest = resolve;
		});
		const instance = await createDynamicInstance(onTestFinished, {
			async afterCredentialAccepted() {
				markCredentialAccepted?.();
				await acceptedRequestMayContinue;
			},
		});
		const credential = await addCredential(instance, {
			token: "prospective-revocation-token",
			connectionId: "prospective-revocation-tenant",
			provisioningDomainId: "prospective-revocation-workspace",
		});

		const acceptedRequest = createUser(
			instance.baseURL,
			"prospective-revocation-token",
			{ userName: "accepted-before-revocation@example.com" },
		);
		await credentialAccepted;
		await instance.db.update({
			model: "testSCIMCredential",
			where: [{ field: "id", value: credential.id }],
			update: { status: "revoked" },
		});
		releaseAcceptedRequest?.();

		const acceptedResult = await acceptedRequest;
		const laterResult = await listUsers(
			instance.baseURL,
			"prospective-revocation-token",
		);

		expect(acceptedResult.response.status).toBe(201);
		expect(laterResult.response.status).toBe(401);
		expect(laterResult.response.headers.get("www-authenticate")).toBe(
			'Bearer realm="SCIM"',
		);
		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual([
			expect.objectContaining({
				connectionId: "prospective-revocation-tenant",
				provisioningDomainId: "prospective-revocation-workspace",
			}),
		]);
		expect(
			await instance.db.findMany<{ userName: string }>({
				model: "scimUser",
				where: [],
			}),
		).toEqual([
			expect.objectContaining({
				userName: "accepted-before-revocation@example.com",
			}),
		]);
	});

	it("preserves the first dynamic connection-to-domain binding on remap attempts", async ({
		onTestFinished,
	}) => {
		const instance = await createDynamicInstance(onTestFinished);
		const credential = await addCredential(instance, {
			token: "remap-token",
			connectionId: "dynamic-remap-tenant",
			provisioningDomainId: "original-workspace",
		});

		const first = await listUsers(instance.baseURL, "remap-token");
		await instance.db.update({
			model: "testSCIMCredential",
			where: [{ field: "id", value: credential.id }],
			update: { provisioningDomainId: "different-workspace" },
		});
		const remapped = await listUsers(instance.baseURL, "remap-token");

		expect(first.response.status).toBe(200);
		expect(remapped.response.status).toBe(409);
		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual([
			expect.objectContaining({
				connectionId: "dynamic-remap-tenant",
				provisioningDomainId: "original-workspace",
				decommissionStatus: "active",
			}),
		]);
	});

	it("rejects a resolved dynamic connection after terminal decommissioning", async ({
		onTestFinished,
	}) => {
		const instance = await createDynamicInstance(onTestFinished);
		await addCredential(instance, {
			token: "decommissioned-token",
			connectionId: "dynamic-decommissioned-tenant",
			provisioningDomainId: "decommissioned-workspace",
		});
		const created = await createUser(instance.baseURL, "decommissioned-token", {
			userName: "decommissioned@example.com",
		});

		const decommissioned = await instance.auth.api.decommissionSCIMConnection({
			body: { connectionId: "dynamic-decommissioned-tenant" },
		});
		const rejected = await listUsers(instance.baseURL, "decommissioned-token");

		expect(created.response.status).toBe(201);
		expect(decommissioned.status).toBe("complete");
		expect(rejected.response.status).toBe(401);
		expect(rejected.response.headers.get("www-authenticate")).toBe(
			'Bearer realm="SCIM"',
		);
		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual([
			expect.objectContaining({
				connectionId: "dynamic-decommissioned-tenant",
				provisioningDomainId: "decommissioned-workspace",
				decommissionStatus: "complete",
			}),
		]);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("permanently decommissions a dynamic connection before its first request", async ({
		onTestFinished,
	}) => {
		const instance = await createDynamicInstance(onTestFinished);
		await addCredential(instance, {
			token: "never-used-decommissioned-token",
			connectionId: "never-used-decommissioned-tenant",
			provisioningDomainId: "never-used-decommissioned-workspace",
		});

		const decommissioned = await instance.auth.api.decommissionSCIMConnection({
			body: {
				connectionId: "never-used-decommissioned-tenant",
				provisioningDomainId: "never-used-decommissioned-workspace",
			},
		});
		const rejected = await listUsers(
			instance.baseURL,
			"never-used-decommissioned-token",
		);

		expect(decommissioned).toEqual({
			connectionId: "never-used-decommissioned-tenant",
			provisioningDomainId: "never-used-decommissioned-workspace",
			status: "complete",
			decommissionedAt: expect.any(Date),
			completedAt: expect.any(Date),
			retryAfter: null,
			reconciledUsers: 0,
			batches: 0,
		});
		expect(rejected.response.status).toBe(401);
		expect(rejected.response.headers.get("www-authenticate")).toBe(
			'Bearer realm="SCIM"',
		);
		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual([
			expect.objectContaining({
				connectionId: "never-used-decommissioned-tenant",
				provisioningDomainId: "never-used-decommissioned-workspace",
				decommissionStatus: "complete",
				decommissionReconciledUserCount: 0,
				decommissionBatchCount: 0,
			}),
		]);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("keeps a never-used terminal binding idempotent and immutable", async ({
		onTestFinished,
	}) => {
		const instance = await createDynamicInstance(onTestFinished);
		const body = {
			connectionId: "idempotent-tombstone-tenant",
			provisioningDomainId: "idempotent-tombstone-workspace",
		};

		const first = await instance.auth.api.decommissionSCIMConnection({ body });
		const repeated = await instance.auth.api.decommissionSCIMConnection({
			body,
		});
		const bindingBeforeMismatch = await instance.db.findMany({
			model: "scimConnectionBinding",
			where: [],
		});
		await expect(
			instance.auth.api.decommissionSCIMConnection({
				body: {
					connectionId: body.connectionId,
					provisioningDomainId: "different-workspace",
				},
			}),
		).rejects.toThrow("is already bound to provisioning domain");

		expect(repeated).toEqual(first);
		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual(bindingBeforeMismatch);
		expect(bindingBeforeMismatch).toHaveLength(1);
		expect(bindingBeforeMismatch[0]).toEqual(
			expect.objectContaining({
				connectionId: body.connectionId,
				provisioningDomainId: body.provisioningDomainId,
				decommissionStatus: "complete",
			}),
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("preserves the missing-binding error for legacy decommission calls", async ({
		onTestFinished,
	}) => {
		const instance = await createDynamicInstance(onTestFinished);

		await expect(
			instance.auth.api.decommissionSCIMConnection({
				body: { connectionId: "legacy-never-used-tenant" },
			}),
		).rejects.toThrow(
			'SCIM connection "legacy-never-used-tenant" has no persisted binding.',
		);
		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual([]);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("does not mutate an active binding when decommissioning names another domain", async ({
		onTestFinished,
	}) => {
		const instance = await createDynamicInstance(onTestFinished);
		await addCredential(instance, {
			token: "active-domain-mismatch-token",
			connectionId: "active-domain-mismatch-tenant",
			provisioningDomainId: "active-domain-mismatch-workspace",
		});
		expect(
			(await listUsers(instance.baseURL, "active-domain-mismatch-token"))
				.response.status,
		).toBe(200);
		const bindingBeforeMismatch = await instance.db.findMany({
			model: "scimConnectionBinding",
			where: [],
		});

		await expect(
			instance.auth.api.decommissionSCIMConnection({
				body: {
					connectionId: "active-domain-mismatch-tenant",
					provisioningDomainId: "different-workspace",
				},
			}),
		).rejects.toThrow("is already bound to provisioning domain");

		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual(bindingBeforeMismatch);
		expect(
			(await listUsers(instance.baseURL, "active-domain-mismatch-token"))
				.response.status,
		).toBe(200);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10475
	 */
	it("converges authentication racing a never-used tombstone", async ({
		onTestFinished,
	}) => {
		let continueAuthentication: (() => void) | undefined;
		const authenticationMayContinue = new Promise<void>((resolve) => {
			continueAuthentication = resolve;
		});
		let markCredentialAccepted: (() => void) | undefined;
		const credentialAccepted = new Promise<void>((resolve) => {
			markCredentialAccepted = resolve;
		});
		const instance = await createDynamicInstance(onTestFinished, {
			async afterCredentialAccepted() {
				markCredentialAccepted?.();
				await authenticationMayContinue;
			},
		});
		await addCredential(instance, {
			token: "tombstone-race-token",
			connectionId: "tombstone-race-tenant",
			provisioningDomainId: "tombstone-race-workspace",
		});

		const authenticating = listUsers(instance.baseURL, "tombstone-race-token");
		await credentialAccepted;
		const decommissioned = await instance.auth.api.decommissionSCIMConnection({
			body: {
				connectionId: "tombstone-race-tenant",
				provisioningDomainId: "tombstone-race-workspace",
			},
		});
		continueAuthentication?.();
		const rejected = await authenticating;

		expect(decommissioned.status).toBe("complete");
		expect(rejected.response.status).toBe(401);
		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual([
			expect.objectContaining({
				connectionId: "tombstone-race-tenant",
				provisioningDomainId: "tombstone-race-workspace",
				decommissionStatus: "complete",
			}),
		]);
	});

	it("converges parallel first use on one dynamic binding", async ({
		onTestFinished,
	}) => {
		const instance = await createDynamicInstance(onTestFinished);
		await addCredential(instance, {
			token: "parallel-token",
			connectionId: "dynamic-parallel-tenant",
			provisioningDomainId: "parallel-workspace",
		});

		const responses = await Promise.all([
			listUsers(instance.baseURL, "parallel-token"),
			listUsers(instance.baseURL, "parallel-token"),
		]);

		expect(responses.map(({ response }) => response.status)).toEqual([
			200, 200,
		]);
		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual([
			expect.objectContaining({
				connectionId: "dynamic-parallel-tenant",
				provisioningDomainId: "parallel-workspace",
			}),
		]);
	});

	it("preserves verifier infrastructure failures as server errors", async ({
		onTestFinished,
	}) => {
		const instance = await createDynamicInstance(onTestFinished, {
			overrides: new Map([
				[
					"infrastructure-error-token",
					new Error("dynamic credential store unavailable"),
				],
			]),
		});

		const response = await fetch(`${instance.baseURL}/api/auth/scim/v2/Users`, {
			headers: scimHeaders("infrastructure-error-token"),
		});

		expect(response.status).toBe(500);
		expect(response.headers.get("www-authenticate")).toBeNull();
		expect(
			await instance.db.findMany({
				model: "scimConnectionBinding",
				where: [],
			}),
		).toEqual([]);
	});
});
