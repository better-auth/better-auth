import { DatabaseSync } from "node:sqlite";
import type { GenericEndpointContext } from "@better-auth/core";
import {
	ATOMIC_WRITES_UNSUPPORTED,
	runWithEndpointContext,
	runWithTransaction,
} from "@better-auth/core/context";
import type { SecondaryStorage } from "@better-auth/core/db";
import type {
	AtomicWriteOperation,
	AtomicWriteResult,
	DBAdapter,
} from "@better-auth/core/db/adapter";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import type { MemoryDB } from "@better-auth/memory-adapter";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { Kysely } from "kysely";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { betterAuth } from "../auth/full";
import { init } from "../context/init";
import { getTestInstance } from "../test-utils/test-instance";
import type {
	BetterAuthOptions,
	BetterAuthPlugin,
	Session,
	User,
	UserProvisioningSource,
} from "../types";
import { getMigrations } from "./get-migration";
import { revokeUnprovenAccountAccess } from "./revoke-unproven-account-access";

function createStringSecondaryStorage(
	store: Map<string, string>,
	ttlStore?: Map<string, number>,
): SecondaryStorage {
	return {
		set(key, value, ttl) {
			store.set(key, value);
			if (ttl !== undefined) ttlStore?.set(key, ttl);
		},
		get(key) {
			return store.get(key) || null;
		},
		getAndDelete(key) {
			const value = store.get(key) || null;
			store.delete(key);
			ttlStore?.delete(key);
			return value;
		},
		increment(key, ttl) {
			const current = Number(store.get(key) ?? 0);
			const count = Number.isFinite(current) ? current + 1 : 1;
			store.set(key, String(count));
			if (current === 0 && ttl !== undefined) ttlStore?.set(key, ttl);
			return count;
		},
		delete(key) {
			store.delete(key);
			ttlStore?.delete(key);
		},
	};
}

function decorateAdapterWithAtomicWrites<Options extends BetterAuthOptions>(
	adapter: DBAdapter<Options>,
	database: DatabaseSync,
	options: { failAtOperationIndex?: number | undefined } = {},
) {
	const submittedBatches: Array<readonly AtomicWriteOperation[]> = [];
	const injectedFailure = new Error("injected atomic write failure");
	let commitQueue: Promise<void> = Promise.resolve();

	const commitOperations = async (
		operations: readonly AtomicWriteOperation[],
	): Promise<AtomicWriteResult[]> => {
		submittedBatches.push([...operations]);
		database.exec("BEGIN IMMEDIATE");
		try {
			const committedResults: AtomicWriteResult[] = [];
			for (const [operationIndex, operation] of operations.entries()) {
				if (operationIndex === options.failAtOperationIndex) {
					throw injectedFailure;
				}
				switch (operation.type) {
					case "create": {
						const createdRecord = await adapter.create<
							Record<string, unknown>,
							Record<string, unknown>
						>({
							model: operation.model,
							data: operation.data,
							forceAllowId: operation.forceAllowId,
						});
						const recordId = createdRecord.id ?? operation.data.id;
						if (typeof recordId !== "string" && typeof recordId !== "number") {
							throw new Error(
								`Atomic test adapter could not read the created ${operation.model} id.`,
							);
						}
						const committedRecord = await adapter.findOne<
							Record<string, unknown>
						>({
							model: operation.model,
							where: [{ field: "id", value: recordId }],
						});
						if (!committedRecord) {
							throw new Error(
								`Atomic test adapter could not reload the created ${operation.model} record.`,
							);
						}
						committedResults.push({
							type: "create",
							record: committedRecord,
						});
						break;
					}
					case "update": {
						const updatedRecord = await adapter.update<Record<string, unknown>>(
							{
								model: operation.model,
								where: operation.where,
								update: operation.update,
							},
						);
						committedResults.push({
							type: "update",
							record: updatedRecord,
						});
						break;
					}
					case "delete": {
						const recordToDelete = await adapter.findOne<
							Record<string, unknown>
						>({
							model: operation.model,
							where: operation.where,
						});
						await adapter.delete({
							model: operation.model,
							where: operation.where,
						});
						committedResults.push({
							type: "delete",
							deletedCount: recordToDelete ? 1 : 0,
						});
						break;
					}
					case "deleteMany": {
						const deletedCount = await adapter.deleteMany({
							model: operation.model,
							where: operation.where,
						});
						committedResults.push({ type: "deleteMany", deletedCount });
						break;
					}
				}
			}
			database.exec("COMMIT");
			return committedResults;
		} catch (error) {
			database.exec("ROLLBACK");
			throw error;
		}
	};

	adapter.commitAtomicWrites = (operations) => {
		const pendingCommit = commitQueue.then(() => commitOperations(operations));
		commitQueue = pendingCommit.then(
			() => undefined,
			() => undefined,
		);
		return pendingCommit;
	};

	return { injectedFailure, submittedBatches };
}

async function createAtomicWriteTestContext(
	options: Omit<BetterAuthOptions, "database"> = {},
	decoratorOptions: { failAtOperationIndex?: number | undefined } = {},
) {
	const database = new DatabaseSync(":memory:");
	const kysely = new Kysely({
		dialect: new NodeSqliteDialect({ database }),
	});
	const authOptions: BetterAuthOptions = {
		...options,
		database: { db: kysely, type: "sqlite", transaction: false },
	};
	await (await getMigrations(authOptions)).runMigrations();
	database.exec("PRAGMA foreign_keys = ON");
	const context = await init(authOptions);
	const atomicWrites = decorateAdapterWithAtomicWrites(
		context.adapter,
		database,
		decoratorOptions,
	);
	return { atomicWrites, context, database, kysely };
}

const provisioningRecordPlugin = {
	id: "provisioning-record-test",
	schema: {
		provisioningRecord: {
			fields: {
				userId: { type: "string", required: true },
				identityId: { type: "string", required: true },
				accountId: { type: "string", required: true },
			},
		},
	},
} satisfies BetterAuthPlugin;

describe("internal adapter test", async () => {
	const map = new Map<string, string>();
	const expirationMap = new Map<string, number>();
	let id = 1;
	const hookUserCreateBefore = vi.fn();
	const hookUserCreateAfter = vi.fn();
	const hookIdentityCreateBefore = vi.fn();
	const hookIdentityCreateAfter = vi.fn();
	const hookIdentityDeleteBefore = vi.fn();
	const hookIdentityDeleteAfter = vi.fn();
	const hookAccountCreateBefore = vi.fn();
	const hookAccountCreateAfter = vi.fn();
	const hookAccountUpdateBefore = vi.fn();
	const hookAccountUpdateAfter = vi.fn();
	const hookAccountDeleteBefore = vi.fn();
	const hookAccountDeleteAfter = vi.fn();
	const hookVerificationCreateBefore = vi.fn();
	const hookVerificationCreateAfter = vi.fn();
	const hookVerificationDeleteBefore = vi.fn();
	const hookVerificationDeleteAfter = vi.fn();
	const pluginHookUserCreateBefore = vi.fn();
	const pluginHookUserCreateAfter = vi.fn();
	const opts = {
		database: new DatabaseSync(":memory:"),
		user: {
			fields: {
				email: "email_address",
				emailVerified: "email_verified",
			},
		},
		verification: {
			storeInDatabase: true,
		},
		secondaryStorage: createStringSecondaryStorage(map, expirationMap),
		advanced: {
			database: {
				generateId() {
					return (id++).toString();
				},
			},
		},
		databaseHooks: {
			user: {
				create: {
					async before(user, context) {
						hookUserCreateBefore(user, context);
						return { data: user };
					},
					async after(user, context) {
						hookUserCreateAfter(user, context);
						return;
					},
				},
			},
			identity: {
				create: {
					async before(identity, context) {
						hookIdentityCreateBefore(identity, context);
						return { data: identity };
					},
					async after(identity, context) {
						hookIdentityCreateAfter(identity, context);
					},
				},
				delete: {
					async before(identity, context) {
						hookIdentityDeleteBefore(identity, context);
					},
					async after(identity, context) {
						hookIdentityDeleteAfter(identity, context);
					},
				},
			},
			account: {
				create: {
					async before(account, context) {
						hookAccountCreateBefore(account, context);
						return { data: account };
					},
					async after(account, context) {
						hookAccountCreateAfter(account, context);
					},
				},
				update: {
					async before(account, context) {
						return hookAccountUpdateBefore(account, context);
					},
					async after(account, context) {
						hookAccountUpdateAfter(account, context);
					},
				},
				delete: {
					async before(account, context) {
						hookAccountDeleteBefore(account, context);
					},
					async after(account, context) {
						hookAccountDeleteAfter(account, context);
					},
				},
			},
			verification: {
				create: {
					async before(verification, context) {
						hookVerificationCreateBefore(verification, context);
						return { data: verification };
					},
					async after(verification, context) {
						hookVerificationCreateAfter(verification, context);
						return;
					},
				},
				delete: {
					async before(verification, context) {
						hookVerificationDeleteBefore(verification, context);
						return;
					},
					async after(verification, context) {
						hookVerificationDeleteAfter(verification, context);
						return;
					},
				},
			},
		},
		plugins: [
			{
				id: "test-plugin",
				init(ctx) {
					return {
						options: {
							databaseHooks: {
								user: {
									create: {
										async before(user, context) {
											pluginHookUserCreateBefore(user, context);
											return { data: user };
										},
										async after(user, context) {
											pluginHookUserCreateAfter(user, context);
										},
									},
								},
								session: {
									create: {
										before: async (session) => {
											return {
												data: {
													...session,
													activeOrganizationId: "1",
												},
											};
										},
									},
								},
							},
						},
					};
				},
			} satisfies BetterAuthPlugin,
		],
	} satisfies BetterAuthOptions;
	beforeAll(async () => {
		(await getMigrations(opts)).runMigrations();
	});
	afterEach(async () => {
		vi.clearAllMocks();
		map.clear();
	});
	const authContext = await init(opts);
	const internalAdapter = authContext.internalAdapter;

	it("retries account cleanup when another cleanup lock outlives the wait deadline", async () => {
		vi.useFakeTimers();
		const database = new DatabaseSync(":memory:");
		const testOpts = { database } satisfies BetterAuthOptions;
		(await getMigrations(testOpts)).runMigrations();
		const context = await init(testOpts);
		const endpointContext = {
			context,
		} as unknown as GenericEndpointContext;
		const user = await context.internalAdapter.createUser(
			{
				email: "cleanup-lock@example.com",
				name: "Cleanup Lock",
				emailVerified: false,
			},
			{ method: "test" },
		);
		const lockIdentifier = `revoke-unproven-account-access:${user.id}`;
		expect(user.emailVerified).toBe(false);
		await context.internalAdapter.linkAccount(
			user.id,
			{
				issuer: "https://cleanup-lock.example.com",
				providerAccountId: "cleanup-lock-provider-user",
			},
			{
				providerId: "cleanup-lock-provider",
				providerInstanceId: "cleanup-lock-provider",
			},
		);
		await context.internalAdapter.createSession(user.id);
		await context.internalAdapter.reserveVerificationValue({
			identifier: lockIdentifier,
			value: user.id,
			expiresAt: new Date(Date.now() + 5_000),
		});
		expect(
			await context.internalAdapter.reserveVerificationValue({
				identifier: lockIdentifier,
				value: user.id,
				expiresAt: new Date(Date.now() + 5_000),
			}),
		).toBe(false);

		const reserveSpy = vi.spyOn(
			context.internalAdapter,
			"reserveVerificationValue",
		);
		try {
			const cleanup = revokeUnprovenAccountAccess(endpointContext, user.id);
			while (reserveSpy.mock.results.length === 0) {
				await Promise.resolve();
			}
			await reserveSpy.mock.results[0]!.value;
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(2_250);
			await context.internalAdapter.deleteVerificationByIdentifier(
				lockIdentifier,
			);
			await vi.advanceTimersByTimeAsync(250);

			await expect(cleanup).resolves.toMatchObject({ emailVerified: true });
			await expect(
				context.internalAdapter.findUserById(user.id),
			).resolves.toMatchObject({ emailVerified: true });
			await expect(
				context.internalAdapter.listUserAccounts(user.id),
			).resolves.toEqual([]);
			await expect(
				context.internalAdapter.listSessions(user.id),
			).resolves.toEqual([]);
		} finally {
			reserveSpy.mockRestore();
			vi.useRealTimers();
			database.close();
		}
	});

	it("returns null when a cached user update matches no row", async () => {
		const database = new DatabaseSync(":memory:");
		const log = vi.fn();
		const testOpts = {
			database,
			logger: { log },
			secondaryStorage: createStringSecondaryStorage(new Map()),
		} satisfies BetterAuthOptions;
		(await getMigrations(testOpts)).runMigrations();
		const context = await init(testOpts);

		try {
			await expect(
				context.internalAdapter.updateUser("missing-user", {
					name: "Missing User",
				}),
			).resolves.toBeNull();
			await expect(
				context.internalAdapter.updateUserByEmail("missing@example.com", {
					name: "Missing User",
				}),
			).resolves.toBeNull();
			expect(log).not.toHaveBeenCalledWith(
				"error",
				expect.stringContaining(
					"Failed to refresh committed user sessions in secondary storage",
				),
				expect.anything(),
			);
		} finally {
			database.close();
		}
	});

	it("creates a user with one identity and one account", async () => {
		const created = await internalAdapter.createUserWithAccount(
			{
				email: "email@email.com",
				name: "name",
				emailVerified: false,
			},
			{
				source: { method: "oauth", oauth: { providerId: "provider" } },
				buildAuthentication: () => ({
					identity: {
						issuer: "local:provider",
						providerAccountId: "account",
					},
					account: {
						providerId: "provider",
						providerInstanceId: "provider",
						accessTokenExpiresAt: new Date(),
						refreshTokenExpiresAt: new Date(),
					},
				}),
			},
		);
		expect(created).toMatchObject({
			user: {
				id: "1",
				name: "name",
				email: "email@email.com",
				emailVerified: false,
				image: null,
				createdAt: expect.any(Date),
				updatedAt: expect.any(Date),
			},
			identity: {
				id: "2",
				userId: "1",
				issuer: "local:provider",
				providerAccountId: "account",
				createdAt: expect.any(Date),
				updatedAt: expect.any(Date),
			},
			account: {
				id: "3",
				identityId: "2",
				providerId: "provider",
				providerInstanceId: "provider",
				accessToken: null,
				refreshToken: null,
				refreshTokenExpiresAt: expect.any(Date),
				accessTokenExpiresAt: expect.any(Date),
			},
		});
		await expect(
			internalAdapter.findUserByIdentityKey({
				issuer: created.identity.issuer,
				providerAccountId: created.identity.providerAccountId,
			}),
		).resolves.toEqual({ user: created.user, identity: created.identity });
		await expect(
			internalAdapter.findAccountByKey({
				identityId: created.identity.id,
				providerInstanceId: created.account.providerInstanceId,
			}),
		).resolves.toEqual(created.account);
		expect(pluginHookUserCreateAfter).toHaveBeenCalledOnce();
		expect(pluginHookUserCreateBefore).toHaveBeenCalledOnce();
		expect(hookUserCreateAfter).toHaveBeenCalledOnce();
		expect(hookUserCreateBefore).toHaveBeenCalledOnce();
		expect(hookIdentityCreateAfter).toHaveBeenCalledOnce();
		expect(hookIdentityCreateBefore).toHaveBeenCalledOnce();
		expect(hookAccountCreateAfter).toHaveBeenCalledOnce();
		expect(hookAccountCreateBefore).toHaveBeenCalledOnce();
	});

	it("aborts provider account creation when user creation is vetoed", async () => {
		const database = new DatabaseSync(":memory:");
		const abortingOptions = {
			...opts,
			database,
			databaseHooks: {
				user: {
					create: {
						async before() {
							return false;
						},
					},
				},
			},
			plugins: [],
		} satisfies BetterAuthOptions;
		try {
			(await getMigrations(abortingOptions)).runMigrations();
			const abortingContext = await init(abortingOptions);

			await expect(
				abortingContext.internalAdapter.createUserWithAccount(
					{
						email: "blocked@email.com",
						name: "Blocked",
						emailVerified: false,
					},
					{
						source: { method: "oauth", oauth: { providerId: "provider" } },
						buildAuthentication: () => ({
							identity: {
								issuer: "local:provider",
								providerAccountId: "account",
							},
							account: {
								providerId: "provider",
								providerInstanceId: "provider",
								accessTokenExpiresAt: new Date(),
								refreshTokenExpiresAt: new Date(),
							},
						}),
					},
				),
			).rejects.toThrow("Failed to create user");
		} finally {
			database.close();
		}
	});

	it("rolls back user creation when the account hook rejects it", async () => {
		const database = new DatabaseSync(":memory:");
		const abortingOptions = {
			...opts,
			database,
			databaseHooks: {
				account: {
					create: {
						async before() {
							return false;
						},
					},
				},
			},
			plugins: [],
		} satisfies BetterAuthOptions;
		try {
			(await getMigrations(abortingOptions)).runMigrations();
			const abortingContext = await init(abortingOptions);

			await expect(
				abortingContext.internalAdapter.createUserWithAccount(
					{
						email: "rejected.provider@example.com",
						name: "Rejected Provider User",
						emailVerified: false,
					},
					{
						source: {
							method: "oauth",
							oauth: { providerId: "rejected-provider" },
						},
						buildAuthentication: () => ({
							identity: {
								issuer: "https://provider.example.com",
								providerAccountId: "rejected-subject",
							},
							account: {
								providerId: "rejected-provider",
								providerInstanceId: "rejected-provider",
							},
						}),
					},
				),
			).rejects.toThrow("Failed to create account");
			await expect(
				abortingContext.internalAdapter.listUsers(),
			).resolves.toEqual([]);
		} finally {
			database.close();
		}
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/9864
	 */
	it("rejects createUser outside an endpoint context when validateUserInfo is configured", async () => {
		const { auth } = await getTestInstance(
			{
				user: {
					validateUserInfo() {
						return;
					},
				},
			},
			{ disableTestUser: true },
		);
		const context = await auth.$context;

		await expect(
			context.internalAdapter.createUser(
				{
					email: "missing-context@example.com",
					name: "Missing Context",
					emailVerified: false,
				},
				{ method: "test" },
			),
		).rejects.toMatchObject({
			body: { code: "validation_context_missing" },
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/9864
	 */
	it("requires a provisioning source when validateUserInfo is configured", async () => {
		const { auth } = await getTestInstance(
			{
				user: {
					validateUserInfo() {
						return;
					},
				},
			},
			{ disableTestUser: true },
		);
		const context = await auth.$context;
		const missingSource = undefined as unknown as Parameters<
			typeof context.internalAdapter.createUser
		>[1];

		await runWithEndpointContext(
			{ context } as unknown as GenericEndpointContext,
			async () => {
				await expect(
					context.internalAdapter.createUser(
						{
							email: "missing-source@example.com",
							name: "Missing Source",
							emailVerified: false,
						},
						missingSource,
					),
				).rejects.toMatchObject({
					body: { code: "validation_source_missing" },
				});
			},
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/9864
	 */
	it("forces create-user as the createUser validation action", async () => {
		let capturedAction: string | undefined;
		const { auth } = await getTestInstance(
			{
				user: {
					validateUserInfo({ source }) {
						capturedAction = source.action;
					},
				},
			},
			{ disableTestUser: true },
		);
		const context = await auth.$context;
		const spoofedSource = {
			method: "test",
			action: "sign-in",
		} as unknown as Parameters<typeof context.internalAdapter.createUser>[1];

		await runWithEndpointContext(
			{ context } as unknown as GenericEndpointContext,
			async () => {
				await context.internalAdapter.createUser(
					{
						email: "canonical-action@example.com",
						name: "Canonical Action",
						emailVerified: false,
					},
					spoofedSource,
				);
			},
		);

		expect(capturedAction).toBe("create-user");
	});

	it("validates users with their provisioning source", async () => {
		let capturedSource: UserProvisioningSource & { action?: string } = {
			method: "anonymous",
		};
		const { auth } = await getTestInstance(
			{
				user: {
					validateUserInfo({ source }) {
						capturedSource = source;
					},
				},
			},
			{ disableTestUser: true },
		);
		const context = await auth.$context;

		await runWithEndpointContext(
			{ context } as unknown as GenericEndpointContext,
			async () => {
				await context.internalAdapter.createUserWithAccount(
					{
						email: "validated.provider@example.com",
						name: "Validated Provider",
						emailVerified: true,
					},
					{
						source: {
							method: "oauth",
							oauth: { providerId: "validated-provider" },
						},
						buildAuthentication: () => ({
							identity: {
								issuer: "https://validated-provider.example.com",
								providerAccountId: "validated-subject",
							},
							account: {
								providerId: "validated-provider",
								providerInstanceId: "validated-provider",
							},
						}),
					},
				);
			},
		);

		expect(capturedSource).toMatchObject({
			action: "create-user",
			method: "oauth",
			oauth: { providerId: "validated-provider" },
		});
	});
	it("should find session with custom userId", async () => {
		const { client, signInWithTestUser } = await getTestInstance({
			session: {
				fields: {
					userId: "user_id",
				},
			},
		});
		const { headers } = await signInWithTestUser();
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session).toBeDefined();
	});

	it("should delete expired verification values on find", async () => {
		await internalAdapter.createVerificationValue({
			identifier: `test-id-1`,
			value: "test-id-1",
			expiresAt: new Date(Date.now() - 1000),
		});
		expect(hookVerificationCreateBefore).toHaveBeenCalledOnce();
		expect(hookVerificationCreateAfter).toHaveBeenCalledOnce();

		const value = await internalAdapter.findVerificationValue("test-id-1");
		expect(value).toMatchObject({
			identifier: "test-id-1",
		});
		expect(hookVerificationDeleteBefore).toHaveBeenCalledOnce();
		expect(hookVerificationDeleteAfter).toHaveBeenCalledOnce();

		const value2 = await internalAdapter.findVerificationValue("test-id-1");
		expect(value2).toBeNull();
		await internalAdapter.createVerificationValue({
			identifier: `test-id-1`,
			value: "test-id-1",
			expiresAt: new Date(Date.now() + 1000),
		});
		const value3 = await internalAdapter.findVerificationValue("test-id-1");
		expect(value3).toMatchObject({
			identifier: "test-id-1",
		});
		const value4 = await internalAdapter.findVerificationValue("test-id-1");
		expect(value4).toMatchObject({
			identifier: "test-id-1",
		});
	});

	it("should delete verification by value with hooks", async () => {
		await internalAdapter.createVerificationValue({
			identifier: `test-id-1`,
			value: "test-id-1",
			expiresAt: new Date(Date.now() + 1000),
		});

		await internalAdapter.deleteVerificationByIdentifier("test-id-1");
		expect(hookVerificationDeleteBefore).toHaveBeenCalledTimes(2);
		expect(hookVerificationDeleteAfter).toHaveBeenCalledTimes(2);
	});

	it("should delete verification by identifier with hooks", async () => {
		const verification = await internalAdapter.createVerificationValue({
			identifier: `test-id-1`,
			value: "test-id-1",
			expiresAt: new Date(Date.now() + 1000),
		});

		await internalAdapter.deleteVerificationByIdentifier(
			verification.identifier,
		);
		expect(hookVerificationDeleteBefore).toHaveBeenCalledOnce();
		expect(hookVerificationDeleteAfter).toHaveBeenCalledOnce();
	});

	it("deletes every verification sharing an identifier with hooks", async () => {
		await internalAdapter.createVerificationValue({
			identifier: "shared-verification-id",
			value: "first",
			expiresAt: new Date(Date.now() + 1_000),
		});
		await internalAdapter.createVerificationValue({
			identifier: "shared-verification-id",
			value: "second",
			expiresAt: new Date(Date.now() + 1_000),
		});

		await internalAdapter.deleteVerificationByIdentifier(
			"shared-verification-id",
		);

		expect(hookVerificationDeleteBefore).toHaveBeenCalledTimes(2);
		expect(hookVerificationDeleteAfter).toHaveBeenCalledTimes(2);
		await expect(
			internalAdapter.findVerificationValue("shared-verification-id"),
		).resolves.toBeNull();
	});

	it("should not call adapter.delete for missing verification record (prevents Prisma P2025)", async () => {
		const verification = await internalAdapter.createVerificationValue({
			identifier: "missing-entity-test",
			value: "test-value",
			expiresAt: new Date(Date.now() + 60000),
		});

		// Remove the DB record so the entity no longer exists
		await authContext.adapter.deleteMany({
			model: "verification",
			where: [{ field: "identifier", value: verification.identifier }],
		});

		const deleteSpy = vi.spyOn(authContext.adapter, "delete");

		await internalAdapter.deleteVerificationByIdentifier("missing-entity-test");

		// adapter.delete should NOT have been called because
		// deleteWithHooks skips deletion when the entity is not found
		const verificationDeleteCalls = deleteSpy.mock.calls.filter(
			(call) => call[0].model === "verification",
		);
		expect(verificationDeleteCalls.length).toBe(0);
		deleteSpy.mockRestore();
	});

	describe("verification token storage", () => {
		it("should hash identifier when storeIdentifier is 'hashed'", async () => {
			const hashedOpts = {
				database: new DatabaseSync(":memory:"),
				verification: {
					storeIdentifier: "hashed" as const,
				},
			} satisfies BetterAuthOptions;

			(await getMigrations(hashedOpts)).runMigrations();
			const hashedCtx = await init(hashedOpts);
			const hashedAdapter = hashedCtx.internalAdapter;

			const verification = await hashedAdapter.createVerificationValue({
				identifier: "reset-password:my-token-123",
				value: "user-id-123",
				expiresAt: new Date(Date.now() + 60000),
			});

			// Stored identifier should be hashed (not equal to original)
			expect(verification.identifier).not.toBe("reset-password:my-token-123");

			// Should be able to find by original identifier
			const found = await hashedAdapter.findVerificationValue(
				"reset-password:my-token-123",
			);
			expect(found).toBeDefined();
			expect(found?.value).toBe("user-id-123");

			// Should be able to delete by original identifier
			await hashedAdapter.deleteVerificationByIdentifier(
				"reset-password:my-token-123",
			);
			const deleted = await hashedAdapter.findVerificationValue(
				"reset-password:my-token-123",
			);
			expect(deleted).toBeNull();
		});

		it("should use overrides for specific prefixes", async () => {
			const overrideOpts = {
				database: new DatabaseSync(":memory:"),
				verification: {
					storeIdentifier: {
						default: "plain" as const,
						overrides: {
							"reset-password": "hashed" as const,
						},
					},
				},
			} satisfies BetterAuthOptions;

			(await getMigrations(overrideOpts)).runMigrations();
			const overrideCtx = await init(overrideOpts);
			const overrideAdapter = overrideCtx.internalAdapter;

			// reset-password should be hashed
			const hashedVerification = await overrideAdapter.createVerificationValue({
				identifier: "reset-password:token-abc",
				value: "user-1",
				expiresAt: new Date(Date.now() + 60000),
			});
			expect(hashedVerification.identifier).not.toBe(
				"reset-password:token-abc",
			);

			// other identifiers should be plain
			const plainVerification = await overrideAdapter.createVerificationValue({
				identifier: "magic-link:token-xyz",
				value: "user-2",
				expiresAt: new Date(Date.now() + 60000),
			});
			expect(plainVerification.identifier).toBe("magic-link:token-xyz");
		});

		it("should fallback to plain lookup for old tokens", async () => {
			const database = new DatabaseSync(":memory:");

			// First create with plain storage
			const plainOpts = {
				database,
				verification: { storeIdentifier: "plain" as const },
			} satisfies BetterAuthOptions;

			(await getMigrations(plainOpts)).runMigrations();
			const plainCtx = await init(plainOpts);
			await plainCtx.internalAdapter.createVerificationValue({
				identifier: "old-token:abc123",
				value: "old-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			// Now switch to hashed storage (simulating config change)
			const hashedOpts = {
				database,
				verification: { storeIdentifier: "hashed" as const },
			} satisfies BetterAuthOptions;

			const hashedCtx = await init(hashedOpts);

			// Should still find old plain token via fallback
			const found =
				await hashedCtx.internalAdapter.findVerificationValue(
					"old-token:abc123",
				);
			expect(found).toBeDefined();
			expect(found?.value).toBe("old-value");
		});
	});

	it("runs the after hook after adding user to db", async () => {
		const sampleUser = {
			name: "sample",
			email: "sample@sampling.com",
			password: "some-sample-password",
		};
		const hookUserCreateAfter = vi.fn();

		const database = new DatabaseSync(":memory:");

		const opts = {
			database,
			databaseHooks: {
				user: {
					create: {
						async after(user, context) {
							hookUserCreateAfter(user, context);

							const userFromDb = database
								.prepare("SELECT * FROM user WHERE id = ?")
								.get(user.id)!;

							expect(user.id).toBe(userFromDb.id);
							expect(user.name).toBe(userFromDb.name);
							expect(user.email).toBe(userFromDb.email);
							expect(user.image).toBe(userFromDb.image);
							expect(user.emailVerified).toBe(
								Boolean(userFromDb.emailVerified),
							);
							expect(user.createdAt).toStrictEqual(
								new Date(userFromDb.createdAt as string),
							);
							expect(user.updatedAt).toStrictEqual(
								new Date(userFromDb.updatedAt as string),
							);
						},
					},
				},
			},
			emailAndPassword: { enabled: true },
		} satisfies BetterAuthOptions;

		const migrations = await getMigrations(opts);
		await migrations.runMigrations();

		const auth = betterAuth(opts);

		await auth.api.signUpEmail({
			body: {
				name: sampleUser.name,
				email: sampleUser.email,
				password: sampleUser.password,
			},
		});

		expect(hookUserCreateAfter).toHaveBeenCalledOnce();
	});

	it("should calculate TTL correctly with Math.floor for secondary storage", async () => {
		const mockStorage = new Map<
			string,
			{ value: string; ttl?: number | undefined }
		>();
		const capturedTTLs: number[] = [];

		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: {
				set(key: string, value: string, ttl?: number | undefined) {
					if (ttl !== undefined) {
						capturedTTLs.push(ttl);
						mockStorage.set(key, { value, ttl });
					} else {
						mockStorage.set(key, { value });
					}
				},
				get(key: string) {
					const item = mockStorage.get(key);
					return item?.value || null;
				},
				getAndDelete(key: string) {
					const item = mockStorage.get(key);
					mockStorage.delete(key);
					return item?.value || null;
				},
				increment(key: string, ttl: number) {
					const item = mockStorage.get(key);
					const count = Number(item?.value ?? 0) + 1;
					mockStorage.set(key, { value: String(count), ttl });
					return count;
				},
				delete(key: string) {
					mockStorage.delete(key);
				},
			},
		} satisfies BetterAuthOptions;

		// Run migrations for the new database
		(await getMigrations(testOpts)).runMigrations();

		// Test the actual refreshUserSessions functionality from internal adapter
		const testCtx = await init(testOpts);
		const ctx = {
			context: testCtx,
		} as GenericEndpointContext;

		const testUser = {
			id: "test-user-id",
			name: "Test User",
			email: "test@example.com",
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		// Create a user in the database first
		await ctx.context.internalAdapter.createUser(testUser, { method: "test" });

		// Test case 1: Session with fractional seconds in TTL
		const expiresAt = new Date(Date.now() + 3599500); // 59 minutes and 59.5 seconds from now
		const expectedTTL = Math.floor(3599500 / 1000); // Should be 3599 seconds (rounded down)

		const session = {
			userId: testUser.id,
			token: "test-token",
			expiresAt,
			ipAddress: "127.0.0.1",
			userAgent: "test-agent",
		};

		// Set up active sessions and session data for refresh test
		const activeSessions = [
			{ token: session.token, expiresAt: expiresAt.getTime() },
		];

		await testCtx.options.secondaryStorage?.set(
			`active-sessions-${testUser.id}`,
			JSON.stringify(activeSessions),
		);

		await testCtx.options.secondaryStorage?.set(
			session.token,
			JSON.stringify({ session, user: testUser }),
		);

		// Trigger refreshUserSessions by updating the user
		await ctx.context.internalAdapter.updateUser(testUser.id, {
			name: "Updated Name",
		});

		// The TTL should be properly rounded down
		const lastTTL = capturedTTLs[capturedTTLs.length - 1];
		expect(lastTTL).toBeLessThanOrEqual(expectedTTL);
		expect(lastTTL).toBeGreaterThanOrEqual(expectedTTL - 1); // Allow for 1 second of test execution time

		// Test case 2: Very small TTL (less than 1 second should round to 0)
		capturedTTLs.length = 0; // Clear array
		const almostExpiredSession = {
			...session,
			token: "almost-expired-token",
			expiresAt: new Date(Date.now() + 500), // 0.5 seconds from now
		};

		await testCtx.options.secondaryStorage?.set(
			`active-sessions-${testUser.id}`,
			JSON.stringify([
				{
					token: almostExpiredSession.token,
					expiresAt: almostExpiredSession.expiresAt.getTime(),
				},
			]),
		);

		await testCtx.options.secondaryStorage?.set(
			almostExpiredSession.token,
			JSON.stringify({ session: almostExpiredSession, user: testUser }),
		);

		await ctx.context.internalAdapter.updateUser(testUser.id, {
			name: "Updated Again",
		});

		// Should be rounded down to 0
		expect(capturedTTLs.at(-1)).toBe(0);

		// Test case 3: Large TTL with fractional component
		capturedTTLs.length = 0; // Clear array
		const longSession = {
			...session,
			token: "long-token",
			expiresAt: new Date(Date.now() + 7199999), // ~2 hours from now (7199.999 seconds)
		};

		await testCtx.options.secondaryStorage?.set(
			`active-sessions-${testUser.id}`,
			JSON.stringify([
				{
					token: longSession.token,
					expiresAt: longSession.expiresAt.getTime(),
				},
			]),
		);

		await testCtx.options.secondaryStorage?.set(
			longSession.token,
			JSON.stringify({ session: longSession, user: testUser }),
		);

		await ctx.context.internalAdapter.updateUser(testUser.id, {
			name: "Final Update",
		});

		// Should be rounded down to 7199
		const finalTTL = capturedTTLs.at(-1);
		expect(finalTTL).toBeLessThanOrEqual(7199);
		expect(finalTTL).toBeGreaterThanOrEqual(7198); // Allow for test execution time
	});

	it("should create on secondary storage", async () => {
		// Create session
		const now = Date.now();
		const expiresAt = new Date(now + 60 * 60 * 24 * 7 * 1000);
		const user = await internalAdapter.createUser(
			{
				name: "test-user",
				email: "test@email.com",
			},
			{ method: "test" },
		);
		const session = await internalAdapter.createSession(user.id);

		// Session should always have an id, even with secondary storage only
		expect(session.id).toBeDefined();
		expect(typeof session.id).toBe("string");
		expect(session.id.length).toBeGreaterThan(0);

		const storedSessionsRaw = map.get(`active-sessions-${user.id}`);
		expect(storedSessionsRaw).toBeDefined();
		const storedSessions: { token: string; expiresAt: number }[] = JSON.parse(
			storedSessionsRaw!,
		);
		const token = session.token;
		// Check stored sessions
		expect(storedSessions.length).toBe(1);
		expect(storedSessions.at(0)?.token).toBe(session.token);
		// Check expiration time set is the last expiration set
		const lastExpiration = storedSessions.reduce((prev, curr) =>
			prev.expiresAt >= curr.expiresAt ? prev : curr,
		);
		const actualExp = expirationMap.get(`active-sessions-${user.id}`);
		expect(actualExp).toBeDefined();
		const expectedExp = Math.floor(
			(lastExpiration.expiresAt - Date.now()) / 1000,
		);
		// max 1s clock drift between check and set
		expect(actualExp! - expectedExp).toBeLessThanOrEqual(1);
		expect(actualExp! - expectedExp).toBeGreaterThanOrEqual(0);

		const storedSession = safeJSONParse<{
			session: Session;
			user: User;
		}>(map.get(token));
		expect(storedSession?.user).toMatchObject(user);
		expect(storedSession?.session).toMatchObject({
			...session,
			activeOrganizationId: "1",
		});
		const actualTokenExp = expirationMap.get(token);
		expect(actualTokenExp).toBeDefined();
		const expectedTokenExp = Math.floor(
			(expiresAt.getTime() - Date.now()) / 1000,
		);
		// max 1s clock drift between check and set
		expect(actualTokenExp! - expectedTokenExp).toBeLessThanOrEqual(1);
		expect(actualTokenExp! - expectedTokenExp).toBeGreaterThanOrEqual(0);
	});

	it("should delete on secondary storage", async () => {
		// Create multiple sessions in past and future
		const now = Date.now();
		const userId = "test-user";
		// 10 consecutive days (5 in past, 1 now, 4 in future)
		for (let i = -5; i < 5; i++) {
			const expiresIn = i * 60 * 60 * 24 * 1000;
			const expiresAt = new Date(now + expiresIn);
			await internalAdapter.createSession(
				userId,
				undefined,
				{
					expiresAt,
				},
				true,
			);
			if (i > 0) {
				const actualExp = expirationMap.get(`active-sessions-${userId}`);
				expect(actualExp).toBeDefined();
				const expectedExp = Math.floor(
					(expiresAt.getTime() - Date.now()) / 1000,
				);
				expect(actualExp! - expectedExp).toBeLessThanOrEqual(1); // max 1s clock drift between check and set
				expect(actualExp! - expectedExp).toBeGreaterThanOrEqual(0); // max 1s clock drift between check and set
			} else {
				expect(expirationMap.get(`active-sessions-${userId}`)).toBeUndefined();
			}
		}
		const storedSessionsRaw = map.get(`active-sessions-${userId}`);
		expect(storedSessionsRaw).toBeDefined();
		const storedSessions: { token: string; expiresAt: number }[] = JSON.parse(
			storedSessionsRaw!,
		);
		expect(storedSessions.length).toBe(4);
		const token = storedSessions.at(-1)!.token;
		const tokenStored = map.get(token);
		expect(tokenStored).toBeDefined();

		// Delete session should clean expiresAt and token
		await internalAdapter.deleteSession(token!);
		const afterDeletedRaw = map.get(`active-sessions-${userId}`);
		expect(afterDeletedRaw).toBeDefined();
		const afterDeleted: { token: string; expiresAt: number }[] = JSON.parse(
			afterDeletedRaw!,
		);
		expect(afterDeleted.length).toBe(3);
		const removedToken = map.get(token);
		expect(removedToken).toBeUndefined();
		// Check expiration time set is the last expiration set
		const lastExpiration = afterDeleted.reduce((prev, curr) =>
			prev.expiresAt >= curr.expiresAt ? prev : curr,
		);
		const actualExp = expirationMap.get(`active-sessions-${userId}`);
		expect(actualExp).toBeDefined();
		const expectedExp = Math.floor(
			(lastExpiration.expiresAt - Date.now()) / 1000,
		);
		expect(actualExp! - expectedExp).toBeLessThanOrEqual(1); // max 1s clock drift between check and set
		expect(actualExp! - expectedExp).toBeGreaterThanOrEqual(0); // max 1s clock drift between check and set
	});

	it("deletes every matched session beyond the adapter read limit", async () => {
		const sessionDeleteBefore = vi.fn();
		const sessionDeleteAfter = vi.fn();
		const database = new DatabaseSync(":memory:");
		const bulkDeleteOptions = {
			database,
			databaseHooks: {
				session: {
					delete: {
						before: sessionDeleteBefore,
						after: sessionDeleteAfter,
					},
				},
			},
		} satisfies BetterAuthOptions;
		try {
			(await getMigrations(bulkDeleteOptions)).runMigrations();
			const bulkDeleteContext = await init(bulkDeleteOptions);
			const user = await bulkDeleteContext.internalAdapter.createUser(
				{
					name: "Bulk Session User",
					email: "bulk.session@example.com",
				},
				{ method: "test" },
			);
			const sessionCount = 101;
			await Promise.all(
				Array.from({ length: sessionCount }, () =>
					bulkDeleteContext.internalAdapter.createSession(user.id),
				),
			);
			await expect(
				bulkDeleteContext.adapter.count({
					model: "session",
					where: [{ field: "userId", value: user.id }],
				}),
			).resolves.toBe(sessionCount);

			await bulkDeleteContext.internalAdapter.deleteUserSessions(user.id);

			await expect(
				bulkDeleteContext.adapter.count({
					model: "session",
					where: [{ field: "userId", value: user.id }],
				}),
			).resolves.toBe(0);
			expect(sessionDeleteBefore).toHaveBeenCalledTimes(sessionCount);
			expect(sessionDeleteAfter).toHaveBeenCalledTimes(sessionCount);
		} finally {
			database.close();
		}
	});

	it("runs bulk delete after-hooks only for rows this caller commits", async () => {
		const sessionDeleteBefore = vi.fn();
		const sessionDeleteAfter = vi.fn();
		const database = new DatabaseSync(":memory:");
		let competingAdapter: DBAdapter | undefined;
		let competingSessionId: string | undefined;
		let hasCompetingDeleteRun = false;
		const concurrentDeleteOptions = {
			database,
			databaseHooks: {
				session: {
					delete: {
						async before(session) {
							sessionDeleteBefore(session);
							if (
								hasCompetingDeleteRun ||
								!competingAdapter ||
								!competingSessionId
							) {
								return;
							}
							hasCompetingDeleteRun = true;
							await competingAdapter.consumeOne({
								model: "session",
								where: [{ field: "id", value: competingSessionId }],
							});
						},
						async after(session) {
							sessionDeleteAfter(session);
						},
					},
				},
			},
		} satisfies BetterAuthOptions;
		try {
			(await getMigrations(concurrentDeleteOptions)).runMigrations();
			const concurrentDeleteContext = await init(concurrentDeleteOptions);
			competingAdapter = concurrentDeleteContext.adapter;
			const user = await concurrentDeleteContext.internalAdapter.createUser(
				{
					name: "Concurrent Bulk Session User",
					email: "concurrent.bulk.session@example.com",
				},
				{ method: "test" },
			);
			const sessions = await Promise.all(
				Array.from({ length: 3 }, () =>
					concurrentDeleteContext.internalAdapter.createSession(user.id),
				),
			);
			competingSessionId = sessions.at(-1)?.id;

			await concurrentDeleteContext.internalAdapter.deleteUserSessions(user.id);

			expect(sessionDeleteBefore).toHaveBeenCalledTimes(sessions.length);
			expect(sessionDeleteAfter).toHaveBeenCalledTimes(sessions.length - 1);
			expect(
				sessionDeleteAfter.mock.calls.map(([session]) => session.id),
			).not.toContain(competingSessionId);
			await expect(
				concurrentDeleteContext.adapter.count({
					model: "session",
					where: [{ field: "userId", value: user.id }],
				}),
			).resolves.toBe(0);
		} finally {
			database.close();
		}
	});

	it("links provider configurations to one stable identity", async () => {
		const user = await internalAdapter.createUser(
			{
				name: "Provider Alias User",
				email: "provider.alias@example.com",
			},
			{ method: "test" },
		);
		const identityKey = {
			issuer: "https://issuer.example.com",
			providerAccountId: "provider-subject",
		};

		const webAccount = await internalAdapter.linkAccount(user.id, identityKey, {
			providerId: "workforce-web",
			providerInstanceId: "workforce-web",
			accessToken: "web-token",
		});
		const mobileAccount = await internalAdapter.linkAccount(
			user.id,
			identityKey,
			{
				providerId: "workforce-mobile",
				providerInstanceId: "workforce-mobile",
				accessToken: "mobile-token",
			},
		);
		const repeatedWebAccount = await internalAdapter.linkAccount(
			user.id,
			identityKey,
			{
				providerId: "workforce-web",
				providerInstanceId: "workforce-web",
				accessToken: "replacement-token",
			},
		);

		expect(mobileAccount.identity.id).toBe(webAccount.identity.id);
		expect(mobileAccount.account.id).not.toBe(webAccount.account.id);
		expect(repeatedWebAccount).toEqual(webAccount);
		const linkedAccounts = await internalAdapter.listUserAccounts(user.id);
		expect(linkedAccounts).toHaveLength(2);
		expect(linkedAccounts).toEqual(
			expect.arrayContaining([webAccount, mobileAccount]),
		);
		await expect(
			internalAdapter.findUserByEmail(user.email, { includeAccounts: true }),
		).resolves.toEqual({
			user,
			accounts: expect.arrayContaining([webAccount, mobileAccount]),
		});
		expect(hookIdentityCreateBefore).toHaveBeenCalledOnce();
		expect(hookIdentityCreateAfter).toHaveBeenCalledOnce();
		expect(hookAccountCreateBefore).toHaveBeenCalledTimes(2);
		expect(hookAccountCreateAfter).toHaveBeenCalledTimes(2);
		await expect(
			internalAdapter.findAccountWithIdentityById(mobileAccount.account.id),
		).resolves.toEqual(mobileAccount);
	});

	it("keeps identity ownership and account keys immutable", async () => {
		const firstUser = await internalAdapter.createUser(
			{
				name: "First Account Key User",
				email: "first.account.key@example.com",
			},
			{ method: "test" },
		);
		const secondUser = await internalAdapter.createUser(
			{
				name: "Second Account Key User",
				email: "second.account.key@example.com",
			},
			{ method: "test" },
		);
		const providerAccountId = "shared-provider-subject";
		const firstIdentityKey = {
			issuer: "https://first-issuer.example.com",
			providerAccountId,
		};
		const firstLink = await internalAdapter.linkAccount(
			firstUser.id,
			firstIdentityKey,
			{
				providerId: "first-provider-configuration",
				providerInstanceId: "first-provider-configuration",
			},
		);
		const secondLink = await internalAdapter.linkAccount(
			secondUser.id,
			{
				issuer: "https://second-issuer.example.com",
				providerAccountId,
			},
			{
				providerId: "second-provider-configuration",
				providerInstanceId: "second-provider-configuration",
			},
		);

		await expect(
			internalAdapter.linkAccount(secondUser.id, firstIdentityKey, {
				providerId: "another-provider-configuration",
				providerInstanceId: "another-provider-configuration",
			}),
		).rejects.toMatchObject({
			body: { code: "identity_already_linked" },
		});

		await expect(
			internalAdapter.findAccountByKey({
				identityId: firstLink.identity.id,
				providerInstanceId: firstLink.account.providerInstanceId,
			}),
		).resolves.toEqual(firstLink.account);
		await expect(
			internalAdapter.findUserByIdentityKey({
				issuer: secondLink.identity.issuer,
				providerAccountId,
			}),
		).resolves.toEqual({
			user: secondUser,
			identity: secondLink.identity,
		});
		await expect(
			internalAdapter.findUserByIdentityKey({
				issuer: "https://missing-issuer.example.com",
				providerAccountId,
			}),
		).resolves.toBeNull();

		const immutableUpdate = {
			providerId: "renamed-provider-configuration",
		} as unknown as Parameters<typeof internalAdapter.updateAccount>[1];
		await expect(
			internalAdapter.updateAccount(firstLink.account.id, immutableUpdate),
		).rejects.toMatchObject({
			body: { code: "immutable_account_field" },
		});
	});

	it("reports an identity whose owner is missing", async () => {
		const identityKey = {
			issuer: "https://orphaned-identity.example.com",
			providerAccountId: "orphaned-subject",
		};
		opts.database.exec("PRAGMA foreign_keys = OFF");
		try {
			const identity = await authContext.adapter.create({
				model: "identity",
				data: {
					userId: "missing-identity-owner",
					...identityKey,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await expect(
				internalAdapter.findIdentityOwnerByKey(identityKey),
			).resolves.toMatchObject({
				kind: "orphaned",
				identity: { id: identity.id, userId: "missing-identity-owner" },
			});
		} finally {
			opts.database.exec("PRAGMA foreign_keys = ON");
		}
	});

	it("maps a concurrent identity ownership conflict to a typed API error", async () => {
		const database = new DatabaseSync(":memory:");
		const kysely = new Kysely({
			dialect: new NodeSqliteDialect({ database }),
		});
		let identityCreateCount = 0;
		let releaseIdentityCreates: () => void = () => {};
		const bothIdentityCreatesStarted = new Promise<void>((resolve) => {
			releaseIdentityCreates = resolve;
		});
		const raceOptions = {
			database: {
				db: kysely,
				type: "sqlite",
				transaction: false,
			},
			databaseHooks: {
				identity: {
					create: {
						async before(identity) {
							identityCreateCount += 1;
							if (identityCreateCount === 2) releaseIdentityCreates();
							await bothIdentityCreatesStarted;
							return { data: identity };
						},
					},
				},
			},
		} satisfies BetterAuthOptions;
		try {
			await (await getMigrations(raceOptions)).runMigrations();
			const raceContext = await init(raceOptions);
			decorateAdapterWithAtomicWrites(raceContext.adapter, database);
			const firstUser = await raceContext.internalAdapter.createUser(
				{
					name: "First Concurrent Identity User",
					email: "first.concurrent.identity@example.com",
				},
				{ method: "test" },
			);
			const secondUser = await raceContext.internalAdapter.createUser(
				{
					name: "Second Concurrent Identity User",
					email: "second.concurrent.identity@example.com",
				},
				{ method: "test" },
			);
			const identityKey = {
				issuer: "https://concurrent-identity.example.com",
				providerAccountId: "concurrent-subject",
			};

			const linkResults = await Promise.allSettled([
				raceContext.internalAdapter.linkAccount(firstUser.id, identityKey, {
					providerId: "first-concurrent-provider",
					providerInstanceId: "first-concurrent-provider",
				}),
				raceContext.internalAdapter.linkAccount(secondUser.id, identityKey, {
					providerId: "second-concurrent-provider",
					providerInstanceId: "second-concurrent-provider",
				}),
			]);

			expect(
				linkResults.filter(({ status }) => status === "fulfilled"),
			).toHaveLength(1);
			const rejectedLink = linkResults.find(
				(result) => result.status === "rejected",
			);
			expect(rejectedLink).toMatchObject({
				status: "rejected",
				reason: {
					status: "CONFLICT",
					body: { code: "identity_already_linked" },
				},
			});
		} finally {
			await kysely.destroy();
		}
	});

	it("returns null when an account update hook rejects the change", async () => {
		const user = await internalAdapter.createUser(
			{
				name: "Rejected Account Update",
				email: "rejected.account.update@example.com",
			},
			{ method: "test" },
		);
		const linked = await internalAdapter.linkAccount(
			user.id,
			{
				issuer: "https://update-hook.example.com",
				providerAccountId: "update-hook-subject",
			},
			{
				providerId: "update-hook-provider",
				providerInstanceId: "update-hook-provider",
				accessToken: "original-token",
			},
		);
		hookAccountUpdateBefore.mockResolvedValueOnce(false);

		await expect(
			internalAdapter.updateAccount(linked.account.id, {
				accessToken: "rejected-token",
			}),
		).resolves.toBeNull();
		await expect(
			internalAdapter.findAccountByKey({
				identityId: linked.identity.id,
				providerInstanceId: linked.account.providerInstanceId,
			}),
		).resolves.toEqual(linked.account);
		expect(hookAccountUpdateAfter).not.toHaveBeenCalled();
	});

	it("finds the same credential account after the user email changes", async () => {
		const user = await internalAdapter.createUser(
			{
				name: "Stable Credential User",
				email: "stable.credential@example.com",
			},
			{ method: "test" },
		);
		const { account } = await internalAdapter.linkAccount(
			user.id,
			{
				issuer: "local:credential",
				providerAccountId: user.id,
			},
			{
				providerId: "credential",
				providerInstanceId: "credential",
				password: "password-hash",
			},
		);

		await expect(
			internalAdapter.findCredentialAccount(user.id),
		).resolves.toEqual(account);
		await internalAdapter.updatePassword(user.id, "new-password-hash");
		await expect(
			internalAdapter.findCredentialAccount(user.id),
		).resolves.toMatchObject({
			id: account.id,
			password: "new-password-hash",
		});
		await internalAdapter.updateUser(user.id, {
			email: "changed.stable.credential@example.com",
		});
		await expect(
			internalAdapter.findCredentialAccount(user.id),
		).resolves.toMatchObject({
			id: account.id,
			password: "new-password-hash",
		});
	});

	it("preserves identities when accounts are unlinked and removes them with their user", async () => {
		const user = await internalAdapter.createUser(
			{
				name: "Accounts Delete User",
				email: "accounts.delete@example.com",
			},
			{ method: "test" },
		);
		const sharedIdentityKey = {
			issuer: "https://shared-issuer.example.com",
			providerAccountId: "shared-subject",
		};
		const firstLink = await internalAdapter.linkAccount(
			user.id,
			sharedIdentityKey,
			{ providerId: "shared-web", providerInstanceId: "shared-web" },
		);
		const secondLink = await internalAdapter.linkAccount(
			user.id,
			sharedIdentityKey,
			{ providerId: "shared-mobile", providerInstanceId: "shared-mobile" },
		);
		const independentLink = await internalAdapter.linkAccount(
			user.id,
			{
				issuer: "https://independent-issuer.example.com",
				providerAccountId: "independent-subject",
			},
			{ providerId: "independent", providerInstanceId: "independent" },
		);

		await internalAdapter.deleteAccount(firstLink.account.id);
		expect(hookAccountDeleteBefore).toHaveBeenCalledOnce();
		expect(hookAccountDeleteAfter).toHaveBeenCalledOnce();
		expect(hookIdentityDeleteBefore).not.toHaveBeenCalled();
		await expect(
			internalAdapter.findIdentityByKey(sharedIdentityKey),
		).resolves.toEqual(secondLink.identity);

		await internalAdapter.deleteAccount(secondLink.account.id);
		expect(hookAccountDeleteBefore).toHaveBeenCalledTimes(2);
		expect(hookAccountDeleteAfter).toHaveBeenCalledTimes(2);
		expect(hookIdentityDeleteBefore).not.toHaveBeenCalled();
		expect(hookIdentityDeleteAfter).not.toHaveBeenCalled();
		await expect(
			internalAdapter.findIdentityByKey(sharedIdentityKey),
		).resolves.toEqual(firstLink.identity);
		await expect(internalAdapter.listUserAccounts(user.id)).resolves.toEqual([
			independentLink,
		]);

		await internalAdapter.deleteUserAccounts(user.id);
		expect(hookAccountDeleteBefore).toHaveBeenCalledTimes(3);
		expect(hookAccountDeleteAfter).toHaveBeenCalledTimes(3);
		expect(hookIdentityDeleteBefore).toHaveBeenCalledTimes(2);
		expect(hookIdentityDeleteAfter).toHaveBeenCalledTimes(2);
		await expect(internalAdapter.listUserAccounts(user.id)).resolves.toEqual(
			[],
		);
		await expect(
			internalAdapter.findIdentityByKey({
				issuer: independentLink.identity.issuer,
				providerAccountId: independentLink.identity.providerAccountId,
			}),
		).resolves.toBeNull();
	});

	it("deletes only accounts for the exact provider instance and preserves their identities", async () => {
		const firstUser = await internalAdapter.createUser(
			{
				name: "First Provider Alias User",
				email: "first.provider.alias@example.com",
			},
			{ method: "test" },
		);
		const secondUser = await internalAdapter.createUser(
			{
				name: "Second Provider Alias User",
				email: "second.provider.alias@example.com",
			},
			{ method: "test" },
		);
		const firstIdentityKey = {
			issuer: "https://first-provider-alias.example.com",
			providerAccountId: "first-provider-subject",
		};
		const secondIdentityKey = {
			issuer: "https://second-provider-alias.example.com",
			providerAccountId: "second-provider-subject",
		};
		const firstTarget = await internalAdapter.linkAccount(
			firstUser.id,
			firstIdentityKey,
			{
				providerId: "enterprise-sso",
				providerInstanceId: "sso:provider:target",
			},
		);
		const secondTarget = await internalAdapter.linkAccount(
			secondUser.id,
			secondIdentityKey,
			{
				providerId: "enterprise-sso",
				providerInstanceId: "sso:provider:target",
			},
		);
		const replacementInstance = await internalAdapter.linkAccount(
			firstUser.id,
			firstIdentityKey,
			{
				providerId: "enterprise-sso",
				providerInstanceId: "sso:provider:replacement",
			},
		);
		const unrelatedAccount = await internalAdapter.linkAccount(
			secondUser.id,
			secondIdentityKey,
			{
				providerId: "unrelated-provider",
				providerInstanceId: "unrelated-provider",
			},
		);

		await internalAdapter.deleteAccountsByProviderInstanceId(
			"sso:provider:target",
		);

		expect(hookAccountDeleteBefore).toHaveBeenCalledTimes(2);
		expect(hookAccountDeleteAfter).toHaveBeenCalledTimes(2);
		expect(
			hookAccountDeleteBefore.mock.calls.map(([account]) => account.id),
		).toEqual(
			expect.arrayContaining([firstTarget.account.id, secondTarget.account.id]),
		);
		await expect(
			internalAdapter.findAccountWithIdentityById(firstTarget.account.id),
		).resolves.toBeNull();
		await expect(
			internalAdapter.findAccountWithIdentityById(secondTarget.account.id),
		).resolves.toBeNull();
		await expect(
			internalAdapter.findAccountWithIdentityById(
				replacementInstance.account.id,
			),
		).resolves.toEqual(replacementInstance);
		await expect(
			internalAdapter.findAccountWithIdentityById(unrelatedAccount.account.id),
		).resolves.toEqual(unrelatedAccount);
		await expect(
			internalAdapter.findIdentityByKey(firstIdentityKey),
		).resolves.toEqual(firstTarget.identity);
		await expect(
			internalAdapter.findIdentityByKey(secondIdentityKey),
		).resolves.toEqual(secondTarget.identity);
		await expect(internalAdapter.findUserById(firstUser.id)).resolves.toEqual(
			firstUser,
		);
		await expect(internalAdapter.findUserById(secondUser.id)).resolves.toEqual(
			secondUser,
		);
	});

	it("surfaces account delete hook rejection from every deletion entry point", async () => {
		const database = new DatabaseSync(":memory:");
		const rejectingOptions = {
			database,
			databaseHooks: {
				account: {
					delete: {
						async before() {
							return false;
						},
					},
				},
			},
		} satisfies BetterAuthOptions;
		try {
			(await getMigrations(rejectingOptions)).runMigrations();
			const rejectingContext = await init(rejectingOptions);
			const user = await rejectingContext.internalAdapter.createUser(
				{
					name: "Preserved Account",
					email: "preserved.account@example.com",
				},
				{ method: "test" },
			);
			const linked = await rejectingContext.internalAdapter.linkAccount(
				user.id,
				{
					issuer: "https://delete-hook.example.com",
					providerAccountId: "preserved-subject",
				},
				{
					providerId: "preserved-provider",
					providerInstanceId: "preserved-provider",
				},
			);

			await expect(
				rejectingContext.internalAdapter.deleteAccount(linked.account.id),
			).rejects.toMatchObject({
				body: { code: "account_deletion_rejected" },
			});
			await expect(
				rejectingContext.internalAdapter.deleteUserAccounts(user.id),
			).rejects.toMatchObject({
				body: { code: "account_deletion_rejected" },
			});
			await expect(
				rejectingContext.internalAdapter.deleteAccountsByProviderInstanceId(
					linked.account.providerInstanceId,
				),
			).rejects.toMatchObject({
				body: { code: "account_deletion_rejected" },
			});
			await expect(
				rejectingContext.internalAdapter.findAccountWithIdentityById(
					linked.account.id,
				),
			).resolves.toEqual(linked);
			await expect(
				rejectingContext.internalAdapter.findIdentityByKey({
					issuer: linked.identity.issuer,
					providerAccountId: linked.identity.providerAccountId,
				}),
			).resolves.toEqual(linked.identity);
			await expect(
				rejectingContext.internalAdapter.findUserById(user.id),
			).resolves.toEqual(user);
		} finally {
			database.close();
		}
	});

	it("does not invoke identity deletion hooks when unlinking an account", async () => {
		const database = new DatabaseSync(":memory:");
		const identityDeleteBefore = vi.fn();
		const rejectingOptions = {
			database,
			databaseHooks: {
				identity: {
					delete: {
						async before() {
							identityDeleteBefore();
							return false;
						},
					},
				},
			},
		} satisfies BetterAuthOptions;
		try {
			(await getMigrations(rejectingOptions)).runMigrations();
			const rejectingContext = await init(rejectingOptions);
			const user = await rejectingContext.internalAdapter.createUser(
				{
					name: "Rejected Identity Unlink",
					email: "rejected.identity.unlink@example.com",
				},
				{ method: "test" },
			);
			const linked = await rejectingContext.internalAdapter.linkAccount(
				user.id,
				{
					issuer: "https://rejected-unlink.example.com",
					providerAccountId: "rejected-unlink-subject",
				},
				{
					providerId: "rejected-unlink-provider",
					providerInstanceId: "rejected-unlink-provider",
				},
			);

			await rejectingContext.internalAdapter.deleteAccount(linked.account.id);
			expect(identityDeleteBefore).not.toHaveBeenCalled();
			await expect(
				rejectingContext.internalAdapter.findAccountWithIdentityById(
					linked.account.id,
				),
			).resolves.toBeNull();
			await expect(
				rejectingContext.internalAdapter.findIdentityByKey({
					issuer: linked.identity.issuer,
					providerAccountId: linked.identity.providerAccountId,
				}),
			).resolves.toEqual(linked.identity);
		} finally {
			database.close();
		}
	});

	it("surfaces post-commit account link hook failures", async () => {
		const database = new DatabaseSync(":memory:");
		const hookError = new Error("account create.after failed");
		const rejectingOptions = {
			database,
			databaseHooks: {
				account: {
					create: {
						async after() {
							throw hookError;
						},
					},
				},
			},
		} satisfies BetterAuthOptions;
		try {
			(await getMigrations(rejectingOptions)).runMigrations();
			const rejectingContext = await init(rejectingOptions);
			const user = await rejectingContext.internalAdapter.createUser(
				{
					name: "Post-commit Hook User",
					email: "post-commit.hook@example.com",
				},
				{ method: "test" },
			);
			const identityKey = {
				issuer: "https://post-commit-hook.example.com",
				providerAccountId: "post-commit-hook-subject",
			};

			await expect(
				rejectingContext.internalAdapter.linkAccount(user.id, identityKey, {
					providerId: "post-commit-hook-provider",
					providerInstanceId: "post-commit-hook-provider",
				}),
			).rejects.toBe(hookError);
			const identity =
				await rejectingContext.internalAdapter.findIdentityByKey(identityKey);
			expect(identity).not.toBeNull();
			await expect(
				rejectingContext.internalAdapter.findAccountByKey({
					identityId: identity!.id,
					providerInstanceId: "post-commit-hook-provider",
				}),
			).resolves.not.toBeNull();
		} finally {
			database.close();
		}
	});

	it("rejects user-with-account creation before hooks or writes without an atomic capability", async () => {
		const database = new DatabaseSync(":memory:");
		const kysely = new Kysely({
			dialect: new NodeSqliteDialect({ database }),
		});
		const userCreateBefore = vi.fn();
		const identityCreateBefore = vi.fn();
		const accountCreateBefore = vi.fn();
		const unsupportedOptions = {
			database: { db: kysely, type: "sqlite", transaction: false },
			databaseHooks: {
				user: {
					create: {
						async before(user) {
							userCreateBefore(user);
							return { data: user };
						},
					},
				},
				identity: {
					create: {
						async before(identity) {
							identityCreateBefore(identity);
							return { data: identity };
						},
					},
				},
				account: {
					create: {
						async before(account) {
							accountCreateBefore(account);
							return { data: account };
						},
					},
				},
			},
			plugins: [],
		} satisfies BetterAuthOptions;
		let restoreCreateSpy = () => {};
		try {
			await (await getMigrations(unsupportedOptions)).runMigrations();
			const unsupportedContext = await init(unsupportedOptions);
			const createSpy = vi.spyOn(unsupportedContext.adapter, "create");
			restoreCreateSpy = () => createSpy.mockRestore();
			const identityKey = {
				issuer: "https://unsupported-create.example.com",
				providerAccountId: "unsupported-create-subject",
			};

			await expect(
				unsupportedContext.internalAdapter.createUserWithAccount(
					{
						name: "Unsupported Provider User",
						email: "unsupported.provider.user@example.com",
						emailVerified: true,
					},
					{
						source: {
							method: "oauth",
							oauth: { providerId: "unsupported-provider" },
						},
						buildAuthentication: () => ({
							identity: identityKey,
							account: {
								providerId: "unsupported-provider",
								providerInstanceId: "unsupported-provider",
							},
						}),
					},
				),
			).rejects.toMatchObject({ code: ATOMIC_WRITES_UNSUPPORTED });
			expect(userCreateBefore).not.toHaveBeenCalled();
			expect(identityCreateBefore).not.toHaveBeenCalled();
			expect(accountCreateBefore).not.toHaveBeenCalled();
			expect(createSpy).not.toHaveBeenCalled();
			await expect(
				unsupportedContext.internalAdapter.findUserByEmail(
					"unsupported.provider.user@example.com",
				),
			).resolves.toBeNull();
			await expect(
				unsupportedContext.internalAdapter.findIdentityByKey(identityKey),
			).resolves.toBeNull();
		} finally {
			restoreCreateSpy();
			await kysely.destroy();
		}
	});

	it("rejects account linking before hooks or writes without an atomic capability", async () => {
		const database = new DatabaseSync(":memory:");
		const kysely = new Kysely({
			dialect: new NodeSqliteDialect({ database }),
		});
		const identityCreateBefore = vi.fn();
		const accountCreateBefore = vi.fn();
		const unsupportedOptions = {
			database: { db: kysely, type: "sqlite", transaction: false },
			databaseHooks: {
				identity: {
					create: {
						async before(identity) {
							identityCreateBefore(identity);
							return { data: identity };
						},
					},
				},
				account: {
					create: {
						async before(account) {
							accountCreateBefore(account);
							return { data: account };
						},
					},
				},
			},
			plugins: [],
		} satisfies BetterAuthOptions;
		let restoreCreateSpy = () => {};
		try {
			await (await getMigrations(unsupportedOptions)).runMigrations();
			const unsupportedContext = await init(unsupportedOptions);
			const user = await unsupportedContext.internalAdapter.createUser(
				{
					name: "Preserved Unsupported Link User",
					email: "preserved.unsupported.link@example.com",
				},
				{ method: "test" },
			);
			const createSpy = vi.spyOn(unsupportedContext.adapter, "create");
			restoreCreateSpy = () => createSpy.mockRestore();
			const identityKey = {
				issuer: "https://unsupported-link.example.com",
				providerAccountId: "unsupported-link-subject",
			};

			await expect(
				unsupportedContext.internalAdapter.linkAccount(user.id, identityKey, {
					providerId: "unsupported-link-provider",
					providerInstanceId: "unsupported-link-provider",
				}),
			).rejects.toMatchObject({ code: ATOMIC_WRITES_UNSUPPORTED });
			expect(identityCreateBefore).not.toHaveBeenCalled();
			expect(accountCreateBefore).not.toHaveBeenCalled();
			expect(createSpy).not.toHaveBeenCalled();
			await expect(
				unsupportedContext.internalAdapter.findIdentityByKey(identityKey),
			).resolves.toBeNull();
			await expect(
				unsupportedContext.internalAdapter.findUserById(user.id),
			).resolves.toEqual(user);
		} finally {
			restoreCreateSpy();
			await kysely.destroy();
		}
	});

	it("rejects account unlinking before hooks or writes without an atomic capability", async () => {
		const database = new DatabaseSync(":memory:");
		const kysely = new Kysely({
			dialect: new NodeSqliteDialect({ database }),
		});
		const accountDeleteBefore = vi.fn();
		const identityDeleteBefore = vi.fn();
		const unsupportedOptions = {
			database: { db: kysely, type: "sqlite", transaction: false },
			databaseHooks: {
				account: {
					delete: {
						async before(account) {
							accountDeleteBefore(account);
						},
					},
				},
				identity: {
					delete: {
						async before(identity) {
							identityDeleteBefore(identity);
						},
					},
				},
			},
			plugins: [],
		} satisfies BetterAuthOptions;
		let restoreDeleteSpy = () => {};
		try {
			await (await getMigrations(unsupportedOptions)).runMigrations();
			const unsupportedContext = await init(unsupportedOptions);
			const user = await unsupportedContext.internalAdapter.createUser(
				{
					name: "Preserved Unsupported Unlink User",
					email: "preserved.unsupported.unlink@example.com",
				},
				{ method: "test" },
			);
			const identityId = "unsupported-unlink-identity";
			const accountId = "unsupported-unlink-account";
			const now = new Date();
			await unsupportedContext.adapter.create({
				model: "identity",
				data: {
					id: identityId,
					userId: user.id,
					issuer: "https://unsupported-unlink.example.com",
					providerAccountId: "unsupported-unlink-subject",
					createdAt: now,
					updatedAt: now,
				},
				forceAllowId: true,
			});
			await unsupportedContext.adapter.create({
				model: "account",
				data: {
					id: accountId,
					identityId,
					providerId: "unsupported-unlink-provider",
					providerInstanceId: "unsupported-unlink-provider",
					createdAt: now,
					updatedAt: now,
				},
				forceAllowId: true,
			});
			const deleteSpy = vi.spyOn(unsupportedContext.adapter, "delete");
			restoreDeleteSpy = () => deleteSpy.mockRestore();

			await expect(
				unsupportedContext.internalAdapter.deleteAccount(accountId),
			).rejects.toMatchObject({ code: ATOMIC_WRITES_UNSUPPORTED });
			expect(accountDeleteBefore).not.toHaveBeenCalled();
			expect(identityDeleteBefore).not.toHaveBeenCalled();
			expect(deleteSpy).not.toHaveBeenCalled();
			await expect(
				unsupportedContext.internalAdapter.findAccountWithIdentityById(
					accountId,
				),
			).resolves.toMatchObject({
				account: { id: accountId, identityId },
				identity: { id: identityId, userId: user.id },
			});
			await expect(
				unsupportedContext.internalAdapter.findUserById(user.id),
			).resolves.toEqual(user);
		} finally {
			restoreDeleteSpy();
			await kysely.destroy();
		}
	});

	it("commits a user authentication graph in one batch and runs after-hooks on committed rows", async () => {
		const afterHookOrder: string[] = [];
		const userCreateAfter = vi.fn();
		const identityCreateAfter = vi.fn();
		const accountCreateAfter = vi.fn();
		const { atomicWrites, context, database, kysely } =
			await createAtomicWriteTestContext({
				databaseHooks: {
					user: {
						create: {
							async after(user) {
								afterHookOrder.push("user");
								userCreateAfter(user);
							},
						},
					},
					identity: {
						create: {
							async after(identity) {
								afterHookOrder.push("identity");
								identityCreateAfter(identity);
							},
						},
					},
					account: {
						create: {
							async after(account) {
								afterHookOrder.push("account");
								accountCreateAfter(account);
							},
						},
					},
				},
				plugins: [provisioningRecordPlugin],
			});
		try {
			database.exec(`
				CREATE TRIGGER user_image_database_default
				AFTER INSERT ON "user"
				FOR EACH ROW
				WHEN NEW.image IS NULL
				BEGIN
					UPDATE "user" SET image = 'database-default' WHERE id = NEW.id;
				END;
			`);

			const created = await context.internalAdapter.createUserWithAccount(
				{
					name: "Atomic Provider User",
					email: "atomic.provider.user@example.com",
					emailVerified: true,
				},
				{
					source: {
						method: "oauth",
						oauth: { providerId: "atomic-provider" },
					},
					buildAuthentication: () => ({
						identity: {
							issuer: "https://atomic-provider.example.com",
							providerAccountId: "atomic-provider-subject",
						},
						account: {
							providerId: "atomic-provider",
							providerInstanceId: "atomic-provider",
						},
					}),
					buildRelatedRecords: ({ userId, identityId, accountId }) => [
						{
							model: "provisioningRecord",
							data: { userId, identityId, accountId },
						},
					],
				},
			);

			expect(atomicWrites.submittedBatches).toHaveLength(1);
			expect(
				atomicWrites.submittedBatches[0]?.map(({ type, model }) => ({
					type,
					model,
				})),
			).toEqual([
				{ type: "create", model: "user" },
				{ type: "create", model: "identity" },
				{ type: "create", model: "account" },
				{ type: "create", model: "provisioningRecord" },
			]);
			expect(created.user.image).toBe("database-default");
			expect(created.identity.userId).toBe(created.user.id);
			expect(created.account.identityId).toBe(created.identity.id);
			expect(afterHookOrder).toEqual(["user", "identity", "account"]);
			expect(userCreateAfter).toHaveBeenCalledOnce();
			expect(userCreateAfter).toHaveBeenCalledWith(
				expect.objectContaining({ image: "database-default" }),
			);
			expect(identityCreateAfter).toHaveBeenCalledOnce();
			expect(accountCreateAfter).toHaveBeenCalledOnce();
			await expect(
				context.adapter.findOne<Record<string, unknown>>({
					model: "provisioningRecord",
					where: [{ field: "userId", value: created.user.id }],
				}),
			).resolves.toMatchObject({
				userId: created.user.id,
				identityId: created.identity.id,
				accountId: created.account.id,
			});
			await expect(
				context.internalAdapter.findUserById(created.user.id),
			).resolves.toMatchObject({ image: "database-default" });
		} finally {
			await kysely.destroy();
		}
	});

	it("rolls back every prefix write and skips after-hooks when an atomic operation fails", async () => {
		const userCreateAfter = vi.fn();
		const identityCreateAfter = vi.fn();
		const accountCreateAfter = vi.fn();
		const { atomicWrites, context, kysely } =
			await createAtomicWriteTestContext(
				{
					databaseHooks: {
						user: { create: { after: userCreateAfter } },
						identity: { create: { after: identityCreateAfter } },
						account: { create: { after: accountCreateAfter } },
					},
					plugins: [provisioningRecordPlugin],
				},
				{ failAtOperationIndex: 3 },
			);
		const identityKey = {
			issuer: "https://atomic-failure.example.com",
			providerAccountId: "atomic-failure-subject",
		};
		try {
			await expect(
				context.internalAdapter.createUserWithAccount(
					{
						name: "Rolled Back Atomic User",
						email: "rolled.back.atomic.user@example.com",
						emailVerified: true,
					},
					{
						source: {
							method: "oauth",
							oauth: { providerId: "atomic-failure-provider" },
						},
						buildAuthentication: () => ({
							identity: identityKey,
							account: {
								providerId: "atomic-failure-provider",
								providerInstanceId: "atomic-failure-provider",
							},
						}),
						buildRelatedRecords: ({ userId, identityId, accountId }) => [
							{
								model: "provisioningRecord",
								data: { userId, identityId, accountId },
							},
						],
					},
				),
			).rejects.toBe(atomicWrites.injectedFailure);
			expect(atomicWrites.submittedBatches).toHaveLength(1);
			await expect(
				context.internalAdapter.findUserByEmail(
					"rolled.back.atomic.user@example.com",
				),
			).resolves.toBeNull();
			await expect(
				context.internalAdapter.findIdentityByKey(identityKey),
			).resolves.toBeNull();
			await expect(
				context.adapter.findMany({ model: "account" }),
			).resolves.toEqual([]);
			await expect(
				context.adapter.findMany({ model: "provisioningRecord" }),
			).resolves.toEqual([]);
			expect(userCreateAfter).not.toHaveBeenCalled();
			expect(identityCreateAfter).not.toHaveBeenCalled();
			expect(accountCreateAfter).not.toHaveBeenCalled();
		} finally {
			await kysely.destroy();
		}
	});

	it("links a new identity and account in one atomic batch", async () => {
		const afterHookOrder: string[] = [];
		const { atomicWrites, context, kysely } =
			await createAtomicWriteTestContext({
				databaseHooks: {
					identity: {
						create: {
							async after() {
								afterHookOrder.push("identity");
							},
						},
					},
					account: {
						create: {
							async after() {
								afterHookOrder.push("account");
							},
						},
					},
				},
				plugins: [provisioningRecordPlugin],
			});
		try {
			const user = await context.internalAdapter.createUser(
				{
					name: "Atomic Link User",
					email: "atomic.link.user@example.com",
				},
				{ method: "test" },
			);
			const identityKey = {
				issuer: "https://atomic-link.example.com",
				providerAccountId: "atomic-link-subject",
			};
			const linked = await context.internalAdapter.linkAccount(
				user.id,
				identityKey,
				{
					providerId: "atomic-link-provider",
					providerInstanceId: "atomic-link-provider",
				},
				{
					buildRelatedRecords: ({ userId, identityId, accountId }) => [
						{
							model: "provisioningRecord",
							data: { userId, identityId, accountId },
						},
					],
				},
			);

			expect(atomicWrites.submittedBatches).toHaveLength(1);
			expect(
				atomicWrites.submittedBatches[0]?.map(({ type, model }) => ({
					type,
					model,
				})),
			).toEqual([
				{ type: "create", model: "identity" },
				{ type: "create", model: "account" },
				{ type: "create", model: "provisioningRecord" },
			]);
			expect(linked.identity.userId).toBe(user.id);
			expect(linked.account.identityId).toBe(linked.identity.id);
			expect(afterHookOrder).toEqual(["identity", "account"]);
			await expect(
				context.adapter.findOne<Record<string, unknown>>({
					model: "provisioningRecord",
					where: [{ field: "accountId", value: linked.account.id }],
				}),
			).resolves.toMatchObject({
				userId: user.id,
				identityId: linked.identity.id,
				accountId: linked.account.id,
			});
			await expect(
				context.internalAdapter.findAccountWithIdentityById(linked.account.id),
			).resolves.toEqual(linked);
		} finally {
			await kysely.destroy();
		}
	});

	it("rolls back an account link when its related atomic write fails", async () => {
		const { atomicWrites, context, kysely } =
			await createAtomicWriteTestContext(
				{ plugins: [provisioningRecordPlugin] },
				{ failAtOperationIndex: 2 },
			);
		const identityKey = {
			issuer: "https://atomic-link-rollback.example.com",
			providerAccountId: "atomic-link-rollback-subject",
		};
		try {
			const user = await context.internalAdapter.createUser(
				{
					name: "Atomic Link Rollback User",
					email: "atomic.link.rollback@example.com",
				},
				{ method: "test" },
			);
			await expect(
				context.internalAdapter.linkAccount(
					user.id,
					identityKey,
					{
						providerId: "atomic-link-rollback-provider",
						providerInstanceId: "atomic-link-rollback-provider",
					},
					{
						buildRelatedRecords: ({ userId, identityId, accountId }) => [
							{
								model: "provisioningRecord",
								data: { userId, identityId, accountId },
							},
						],
					},
				),
			).rejects.toBe(atomicWrites.injectedFailure);

			expect(atomicWrites.submittedBatches).toHaveLength(1);
			await expect(
				context.internalAdapter.findIdentityByKey(identityKey),
			).resolves.toBeNull();
			await expect(
				context.adapter.findMany({ model: "account" }),
			).resolves.toEqual([]);
			await expect(
				context.adapter.findMany({ model: "provisioningRecord" }),
			).resolves.toEqual([]);
		} finally {
			await kysely.destroy();
		}
	});

	it("does not invoke identity deletion hooks in an atomic account unlink", async () => {
		const accountDeleteBefore = vi.fn();
		const accountDeleteAfter = vi.fn();
		const identityDeleteBefore = vi.fn();
		const identityDeleteAfter = vi.fn();
		const { atomicWrites, context, kysely } =
			await createAtomicWriteTestContext({
				databaseHooks: {
					account: {
						delete: {
							async before(account) {
								accountDeleteBefore(account);
							},
							after: accountDeleteAfter,
						},
					},
					identity: {
						delete: {
							async before(identity) {
								identityDeleteBefore(identity);
								return false;
							},
							after: identityDeleteAfter,
						},
					},
				},
				plugins: [],
			});
		try {
			const user = await context.internalAdapter.createUser(
				{
					name: "Atomic Delete Veto User",
					email: "atomic.delete.veto@example.com",
				},
				{ method: "test" },
			);
			const linked = await context.internalAdapter.linkAccount(
				user.id,
				{
					issuer: "https://atomic-delete-veto.example.com",
					providerAccountId: "atomic-delete-veto-subject",
				},
				{
					providerId: "atomic-delete-veto-provider",
					providerInstanceId: "atomic-delete-veto-provider",
				},
			);
			atomicWrites.submittedBatches.length = 0;

			await context.internalAdapter.deleteAccount(linked.account.id);
			expect(accountDeleteBefore).toHaveBeenCalledOnce();
			expect(identityDeleteBefore).not.toHaveBeenCalled();
			expect(accountDeleteAfter).toHaveBeenCalledOnce();
			expect(identityDeleteAfter).not.toHaveBeenCalled();
			expect(atomicWrites.submittedBatches).toHaveLength(1);
			await expect(
				context.internalAdapter.findAccountWithIdentityById(linked.account.id),
			).resolves.toBeNull();
			await expect(
				context.internalAdapter.findIdentityByKey({
					issuer: linked.identity.issuer,
					providerAccountId: linked.identity.providerAccountId,
				}),
			).resolves.toEqual(linked.identity);
		} finally {
			await kysely.destroy();
		}
	});

	it("runs delete after-hooks only for the concurrent account unlink that commits", async () => {
		const accountDeleteAfter = vi.fn();
		const identityDeleteAfter = vi.fn();
		const { context, kysely } = await createAtomicWriteTestContext({
			databaseHooks: {
				account: { delete: { after: accountDeleteAfter } },
				identity: { delete: { after: identityDeleteAfter } },
			},
			plugins: [],
		});
		try {
			const user = await context.internalAdapter.createUser(
				{
					name: "Concurrent Unlink User",
					email: "concurrent.unlink@example.com",
				},
				{ method: "test" },
			);
			const linked = await context.internalAdapter.linkAccount(
				user.id,
				{
					issuer: "https://concurrent-unlink.example.com",
					providerAccountId: "concurrent-unlink-subject",
				},
				{
					providerId: "concurrent-unlink-provider",
					providerInstanceId: "concurrent-unlink-provider",
				},
			);

			await Promise.all([
				context.internalAdapter.deleteAccount(linked.account.id),
				context.internalAdapter.deleteAccount(linked.account.id),
			]);

			expect(accountDeleteAfter).toHaveBeenCalledOnce();
			expect(identityDeleteAfter).not.toHaveBeenCalled();
		} finally {
			await kysely.destroy();
		}
	});

	it("runs delete after-hooks only for the native transaction unlink that commits", async () => {
		const database: MemoryDB = {
			user: [],
			identity: [],
			account: [],
			session: [],
			verification: [],
		};
		const accountDeleteAfter = vi.fn();
		let accountDeleteBeforeCalls = 0;
		let releaseAccountDeletes = () => {};
		const bothAccountDeletesStarted = new Promise<void>((resolve) => {
			releaseAccountDeletes = resolve;
		});
		const createMemoryAdapter = memoryAdapter(database);
		const passthroughTransactionMemoryAdapter = (
			options: BetterAuthOptions,
		) => {
			const adapter = createMemoryAdapter(options);
			const adapterConfig = adapter.options?.adapterConfig;
			if (!adapterConfig) {
				throw new Error("Memory adapter should expose its configuration");
			}
			adapterConfig.transaction = async (callback) => callback(adapter);
			return adapter;
		};
		const auth = betterAuth({
			database: passthroughTransactionMemoryAdapter,
			databaseHooks: {
				account: {
					delete: {
						async before() {
							accountDeleteBeforeCalls++;
							if (accountDeleteBeforeCalls === 2) releaseAccountDeletes();
							await bothAccountDeletesStarted;
						},
						after: accountDeleteAfter,
					},
				},
			},
		});
		const context = await auth.$context;
		const user = await context.internalAdapter.createUser(
			{
				name: "Native Concurrent Unlink User",
				email: "native.concurrent.unlink@example.com",
			},
			{ method: "test" },
		);
		const linked = await context.internalAdapter.linkAccount(
			user.id,
			{
				issuer: "https://native-concurrent-unlink.example.com",
				providerAccountId: "native-concurrent-unlink-subject",
			},
			{
				providerId: "native-concurrent-unlink-provider",
				providerInstanceId: "native-concurrent-unlink-provider",
			},
		);

		await Promise.all([
			context.internalAdapter.deleteAccount(linked.account.id),
			context.internalAdapter.deleteAccount(linked.account.id),
		]);

		expect(accountDeleteAfter).toHaveBeenCalledOnce();
	});

	it("allows an account to be linked while another account is unlinked", async () => {
		const accountDeleteAfter = vi.fn();
		const identityDeleteAfter = vi.fn();
		const { context, kysely } = await createAtomicWriteTestContext({
			databaseHooks: {
				account: { delete: { after: accountDeleteAfter } },
				identity: { delete: { after: identityDeleteAfter } },
			},
			plugins: [],
		});
		try {
			const user = await context.internalAdapter.createUser(
				{
					name: "Concurrent Link User",
					email: "concurrent.link@example.com",
				},
				{ method: "test" },
			);
			const identityKey = {
				issuer: "https://concurrent-link.example.com",
				providerAccountId: "concurrent-link-subject",
			};
			const firstLink = await context.internalAdapter.linkAccount(
				user.id,
				identityKey,
				{
					providerId: "first-provider",
					providerInstanceId: "first-provider",
				},
			);
			const [, secondLink] = await Promise.all([
				context.internalAdapter.deleteAccount(firstLink.account.id),
				context.internalAdapter.linkAccount(user.id, identityKey, {
					providerId: "second-provider",
					providerInstanceId: "second-provider",
				}),
			]);
			await expect(
				context.internalAdapter.findAccountWithIdentityById(
					firstLink.account.id,
				),
			).resolves.toBeNull();
			await expect(
				context.internalAdapter.findAccountWithIdentityById(
					secondLink.account.id,
				),
			).resolves.toEqual(secondLink);
			expect(accountDeleteAfter).toHaveBeenCalledOnce();
			expect(identityDeleteAfter).not.toHaveBeenCalled();
		} finally {
			await kysely.destroy();
		}
	});

	it("rolls back user deletion when a new session is created concurrently", async () => {
		const sessionDeleteAfter = vi.fn();
		let releaseSessionDelete = () => {};
		let markSessionDeleteStarted = () => {};
		const sessionDeleteStarted = new Promise<void>((resolve) => {
			markSessionDeleteStarted = resolve;
		});
		const continueSessionDelete = new Promise<void>((resolve) => {
			releaseSessionDelete = resolve;
		});
		const { context, kysely } = await createAtomicWriteTestContext({
			databaseHooks: {
				session: {
					delete: {
						async before() {
							markSessionDeleteStarted();
							await continueSessionDelete;
						},
						after: sessionDeleteAfter,
					},
				},
			},
			plugins: [],
		});
		try {
			const user = await context.internalAdapter.createUser(
				{
					name: "Concurrent Session User",
					email: "concurrent.session@example.com",
				},
				{ method: "test" },
			);
			const firstSession = await context.internalAdapter.createSession(user.id);
			const pendingDelete = context.internalAdapter.deleteUser(user.id);
			await sessionDeleteStarted;
			const secondSession = await context.internalAdapter.createSession(
				user.id,
			);
			releaseSessionDelete();

			await expect(pendingDelete).rejects.toThrow();
			await expect(
				context.internalAdapter.findUserById(user.id),
			).resolves.toEqual(user);
			await expect(
				context.internalAdapter.listSessions(user.id),
			).resolves.toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: firstSession.id }),
					expect.objectContaining({ id: secondSession.id }),
				]),
			);
			expect(sessionDeleteAfter).not.toHaveBeenCalled();
		} finally {
			releaseSessionDelete();
			await kysely.destroy();
		}
	});

	it("requires application ids before atomic hooks or writes while native serial ids remain supported", async () => {
		const userCreateBefore = vi.fn();
		const identityCreateBefore = vi.fn();
		const accountCreateBefore = vi.fn();
		const { atomicWrites, context, kysely } =
			await createAtomicWriteTestContext({
				advanced: { database: { generateId: false } },
				databaseHooks: {
					user: { create: { before: userCreateBefore } },
					identity: { create: { before: identityCreateBefore } },
					account: { create: { before: accountCreateBefore } },
				},
				plugins: [],
			});
		const createSpy = vi.spyOn(context.adapter, "create");
		try {
			await expect(
				context.internalAdapter.createUserWithAccount(
					{
						name: "Missing Application Id User",
						email: "missing.application.id@example.com",
						emailVerified: true,
					},
					{
						source: {
							method: "oauth",
							oauth: { providerId: "missing-application-id-provider" },
						},
						buildAuthentication: () => ({
							identity: {
								issuer: "https://missing-application-id.example.com",
								providerAccountId: "missing-application-id-subject",
							},
							account: {
								providerId: "missing-application-id-provider",
								providerInstanceId: "missing-application-id-provider",
							},
						}),
					},
				),
			).rejects.toMatchObject({
				code: "ATOMIC_WRITES_REQUIRE_APPLICATION_IDS",
				model: "user",
			});
			expect(userCreateBefore).not.toHaveBeenCalled();
			expect(identityCreateBefore).not.toHaveBeenCalled();
			expect(accountCreateBefore).not.toHaveBeenCalled();
			expect(createSpy).not.toHaveBeenCalled();
			expect(atomicWrites.submittedBatches).toHaveLength(0);
		} finally {
			createSpy.mockRestore();
			await kysely.destroy();
		}

		const nativeDatabase = new DatabaseSync(":memory:");
		const nativeOptions = {
			database: nativeDatabase,
			advanced: { database: { generateId: "serial" } },
			plugins: [],
		} satisfies BetterAuthOptions;
		try {
			await (await getMigrations(nativeOptions)).runMigrations();
			const nativeContext = await init(nativeOptions);
			const created = await nativeContext.internalAdapter.createUserWithAccount(
				{
					name: "Native Serial Id User",
					email: "native.serial.id@example.com",
					emailVerified: true,
				},
				{
					source: {
						method: "oauth",
						oauth: { providerId: "native-serial-id-provider" },
					},
					buildAuthentication: () => ({
						identity: {
							issuer: "https://native-serial-id.example.com",
							providerAccountId: "native-serial-id-subject",
						},
						account: {
							providerId: "native-serial-id-provider",
							providerInstanceId: "native-serial-id-provider",
						},
					}),
				},
			);
			expect(created.user.id).toMatch(/^\d+$/);
			expect(created.identity.userId).toBe(created.user.id);
			expect(created.account.identityId).toBe(created.identity.id);
		} finally {
			nativeDatabase.close();
		}
	});

	it("deletes the complete user lifecycle and committed session cache", async () => {
		const user = await internalAdapter.createUser(
			{
				name: "Complete User Deletion",
				email: "complete.user.deletion@example.com",
			},
			{ method: "test" },
		);
		const identityKey = {
			issuer: "https://complete-deletion.example.com",
			providerAccountId: "complete-deletion-subject",
		};
		const linked = await internalAdapter.linkAccount(user.id, identityKey, {
			providerId: "complete-deletion-provider",
			providerInstanceId: "complete-deletion-provider",
		});
		const session = await internalAdapter.createSession(user.id);
		expect(map.has(session.token)).toBe(true);

		await internalAdapter.deleteUser(user.id);

		await expect(internalAdapter.findUserById(user.id)).resolves.toBeNull();
		await expect(
			internalAdapter.findAccountWithIdentityById(linked.account.id),
		).resolves.toBeNull();
		await expect(
			internalAdapter.findIdentityByKey(identityKey),
		).resolves.toBeNull();
		expect(map.has(session.token)).toBe(false);
		expect(map.has(`active-sessions-${user.id}`)).toBe(false);
	});

	it("rolls back user deletion and keeps cached sessions when identity deletion is rejected", async () => {
		const database = new DatabaseSync(":memory:");
		const sessionStore = new Map<string, string>();
		const rejectingOptions = {
			database,
			secondaryStorage: createStringSecondaryStorage(sessionStore),
			session: { storeSessionInDatabase: true },
			databaseHooks: {
				identity: {
					delete: {
						async before() {
							return false;
						},
					},
				},
			},
		} satisfies BetterAuthOptions;
		try {
			(await getMigrations(rejectingOptions)).runMigrations();
			const rejectingContext = await init(rejectingOptions);
			const user = await rejectingContext.internalAdapter.createUser(
				{
					name: "Rejected User Deletion",
					email: "rejected.user.deletion@example.com",
				},
				{ method: "test" },
			);
			const identityKey = {
				issuer: "https://rejected-deletion.example.com",
				providerAccountId: "rejected-deletion-subject",
			};
			const linked = await rejectingContext.internalAdapter.linkAccount(
				user.id,
				identityKey,
				{
					providerId: "rejected-deletion-provider",
					providerInstanceId: "rejected-deletion-provider",
				},
			);
			const session = await rejectingContext.internalAdapter.createSession(
				user.id,
			);

			await expect(
				rejectingContext.internalAdapter.deleteUser(user.id),
			).rejects.toMatchObject({
				body: { code: "identity_deletion_rejected" },
			});
			await expect(
				rejectingContext.internalAdapter.findUserById(user.id),
			).resolves.toEqual(user);
			await expect(
				rejectingContext.internalAdapter.findAccountWithIdentityById(
					linked.account.id,
				),
			).resolves.toEqual(linked);
			expect(sessionStore.has(session.token)).toBe(true);
			expect(sessionStore.has(`active-sessions-${user.id}`)).toBe(true);
		} finally {
			database.close();
		}
	});

	it("listSessions should skip missing sessions without blanking the list", async () => {
		const testMap = new Map<string, string>();

		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: createStringSecondaryStorage(testMap),
		} satisfies BetterAuthOptions;

		(await getMigrations(testOpts)).runMigrations();

		const testCtx = await init(testOpts);
		const testInternalAdapter = testCtx.internalAdapter;

		const user = await testInternalAdapter.createUser(
			{
				name: "test-user-skip",
				email: "test-skip@email.com",
			},
			{ method: "test" },
		);

		// Create 3 sessions
		const session1 = await testInternalAdapter.createSession(user.id);
		const session2 = await testInternalAdapter.createSession(user.id);
		const session3 = await testInternalAdapter.createSession(user.id);

		// Verify all 3 sessions exist
		let sessions = await testInternalAdapter.listSessions(user.id);
		expect(sessions.length).toBe(3);

		// Delete session2 from storage (simulating missing/expired session)
		testMap.delete(session2.token);

		// listSessions should still return session1 and session3
		sessions = await testInternalAdapter.listSessions(user.id);
		expect(sessions.length).toBe(2);
		expect(sessions.map((s) => s.token).sort()).toEqual(
			[session1.token, session3.token].sort(),
		);
	});

	it("defers secondary session deletion until commit and discards it on rollback", async () => {
		const testMap = new Map<string, string>();
		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: createStringSecondaryStorage(testMap),
		} satisfies BetterAuthOptions;
		(await getMigrations(testOpts)).runMigrations();
		const testCtx = await init(testOpts);
		const user = await testCtx.internalAdapter.createUser(
			{
				name: "transactional-session-user",
				email: "transactional-session@example.com",
			},
			{ method: "test" },
		);
		const session = await testCtx.internalAdapter.createSession(user.id);

		await expect(
			runWithTransaction(testCtx.adapter, async () => {
				await testCtx.internalAdapter.deleteUserSessions(user.id);
				expect(testMap.has(session.token)).toBe(true);
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");
		expect(testMap.has(session.token)).toBe(true);
		expect(testMap.has(`active-sessions-${user.id}`)).toBe(true);

		await runWithTransaction(testCtx.adapter, async () => {
			await testCtx.internalAdapter.deleteUserSessions(user.id);
			expect(testMap.has(session.token)).toBe(true);
		});
		expect(testMap.has(session.token)).toBe(false);
		expect(testMap.has(`active-sessions-${user.id}`)).toBe(false);
	});

	it("preserves a replacement session created before committed cache revocation finishes", async () => {
		const testMap = new Map<string, string>();
		let markVersionWriteStarted: () => void = () => {};
		const versionWriteStarted = new Promise<void>((resolve) => {
			markVersionWriteStarted = resolve;
		});
		let releaseVersionWrite: () => void = () => {};
		const continueVersionWrite = new Promise<void>((resolve) => {
			releaseVersionWrite = resolve;
		});
		const storage = createStringSecondaryStorage(testMap);

		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: storage,
		} satisfies BetterAuthOptions;
		(await getMigrations(testOpts)).runMigrations();
		const testCtx = await init(testOpts);
		const user = await testCtx.internalAdapter.createUser(
			{
				name: "replacement-session-user",
				email: "replacement-session@example.com",
			},
			{ method: "test" },
		);
		const sessionVersionKeyForUser = `session-version-${user.id}`;
		const sessionRevocationStartedAtKeyForUser = `session-revocation-started-at-${user.id}`;
		const originalSet = storage.set;
		let versionWriteBlocked = false;
		storage.set = async (key, value, ttl) => {
			if (key === sessionVersionKeyForUser && !versionWriteBlocked) {
				versionWriteBlocked = true;
				markVersionWriteStarted();
				await continueVersionWrite;
			}
			return originalSet(key, value, ttl);
		};

		const revokedSession = await testCtx.internalAdapter.createSession(user.id);
		const deletion = runWithTransaction(testCtx.adapter, () =>
			testCtx.internalAdapter.deleteUserSessions(user.id),
		);
		await versionWriteStarted;
		const revocationStartedAt = testMap.get(
			sessionRevocationStartedAtKeyForUser,
		);
		expect(revocationStartedAt).toBeDefined();
		const replacementSession = await testCtx.internalAdapter.createSession(
			user.id,
			undefined,
			{
				createdAt: new Date(new Date(revocationStartedAt!).getTime() + 1),
			},
			true,
		);
		releaseVersionWrite();
		await deletion;

		await expect(
			testCtx.internalAdapter.findSession(revokedSession.token),
		).resolves.toBeNull();
		await expect(
			testCtx.internalAdapter.findSession(replacementSession.token),
		).resolves.toMatchObject({
			session: { token: replacementSession.token },
		});
	});

	it("revokes cached sessions even when the active-session index loses a token", async () => {
		const testMap = new Map<string, string>();
		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: createStringSecondaryStorage(testMap),
		} satisfies BetterAuthOptions;
		(await getMigrations(testOpts)).runMigrations();
		const testCtx = await init(testOpts);
		const user = await testCtx.internalAdapter.createUser(
			{
				name: "secondary-session-revocation",
				email: "secondary-session-revocation@example.com",
			},
			{ method: "test" },
		);
		const session = await testCtx.internalAdapter.createSession(user.id);

		testMap.set(`active-sessions-${user.id}`, "[]");
		await testCtx.internalAdapter.deleteUserSessions(user.id);

		await expect(
			testCtx.internalAdapter.findSession(session.token),
		).resolves.toBeNull();
	});

	it("listSessions should skip malformed session data (valid JSON but wrong structure)", async () => {
		const testMap = new Map<string, string>();

		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: createStringSecondaryStorage(testMap),
		} satisfies BetterAuthOptions;

		(await getMigrations(testOpts)).runMigrations();

		const testCtx = await init(testOpts);
		const testInternalAdapter = testCtx.internalAdapter;

		const user = await testInternalAdapter.createUser(
			{
				name: "test-user-malformed",
				email: "test-malformed@email.com",
			},
			{ method: "test" },
		);

		// Create 3 sessions
		const session1 = await testInternalAdapter.createSession(user.id);
		const session2 = await testInternalAdapter.createSession(user.id);
		const session3 = await testInternalAdapter.createSession(user.id);

		// Set session2 to valid JSON but malformed structure (session is null, will throw on property access)
		testMap.set(session2.token, JSON.stringify({ session: null, user: null }));

		// listSessions should still return session1 and session3
		const sessions = await testInternalAdapter.listSessions(user.id);
		expect(sessions.length).toBe(2);
		expect(sessions.map((s) => s.token).sort()).toEqual(
			[session1.token, session3.token].sort(),
		);
	});

	it("findSession should return null for valid JSON with a malformed session shape", async () => {
		const testMap = new Map<string, string>();
		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: createStringSecondaryStorage(testMap),
		} satisfies BetterAuthOptions;
		(await getMigrations(testOpts)).runMigrations();
		const testInternalAdapter = (await init(testOpts)).internalAdapter;
		const user = await testInternalAdapter.createUser(
			{
				name: "test-user-malformed-find",
				email: "test-malformed-find@email.com",
			},
			{ method: "test" },
		);
		const session = await testInternalAdapter.createSession(user.id);
		testMap.set(session.token, JSON.stringify({ session: null, user: null }));

		await expect(
			testInternalAdapter.findSession(session.token),
		).resolves.toBeNull();
	});

	it("listSessions should skip corrupt/unparsable sessions without blanking the list", async () => {
		const testMap = new Map<string, string>();

		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: createStringSecondaryStorage(testMap),
		} satisfies BetterAuthOptions;

		(await getMigrations(testOpts)).runMigrations();

		const testCtx = await init(testOpts);
		const testInternalAdapter = testCtx.internalAdapter;

		const user = await testInternalAdapter.createUser(
			{
				name: "test-user-corrupt",
				email: "test-corrupt@email.com",
			},
			{ method: "test" },
		);

		// Create 3 sessions
		const session1 = await testInternalAdapter.createSession(user.id);
		const session2 = await testInternalAdapter.createSession(user.id);
		const session3 = await testInternalAdapter.createSession(user.id);

		// Corrupt session2 data
		testMap.set(session2.token, "invalid-json{{{");

		// listSessions should still return session1 and session3
		const sessions = await testInternalAdapter.listSessions(user.id);
		expect(sessions.length).toBe(2);
		expect(sessions.map((s) => s.token).sort()).toEqual(
			[session1.token, session3.token].sort(),
		);
	});

	it("listSessions should return empty array when all sessions are missing/corrupt", async () => {
		const testMap = new Map<string, string>();
		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: createStringSecondaryStorage(testMap),
		} satisfies BetterAuthOptions;

		(await getMigrations(testOpts)).runMigrations();

		const testCtx = await init(testOpts);
		const testInternalAdapter = testCtx.internalAdapter;

		const user = await testInternalAdapter.createUser(
			{
				name: "test-user-all-corrupt",
				email: "test-all-corrupt@email.com",
			},
			{ method: "test" },
		);

		// Create 2 sessions
		const session1 = await testInternalAdapter.createSession(user.id);
		const session2 = await testInternalAdapter.createSession(user.id);

		// Corrupt both sessions
		testMap.set(session1.token, "invalid-json");
		testMap.set(session2.token, "also-invalid");

		// listSessions should return empty array
		const sessions = await testInternalAdapter.listSessions(user.id);
		expect(sessions.length).toBe(0);
	});

	it("findSessions should skip malformed JSON values without blanking the list", async () => {
		const testMap = new Map<string, string>();

		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: createStringSecondaryStorage(testMap),
		} satisfies BetterAuthOptions;

		(await getMigrations(testOpts)).runMigrations();

		const testCtx = await init(testOpts);
		const testInternalAdapter = testCtx.internalAdapter;

		const user = await testInternalAdapter.createUser(
			{
				name: "test-user-find",
				email: "test-find@email.com",
			},
			{ method: "test" },
		);

		// Create 3 sessions
		const session1 = await testInternalAdapter.createSession(user.id);
		const session2 = await testInternalAdapter.createSession(user.id);
		const session3 = await testInternalAdapter.createSession(user.id);

		// JSON.parse succeeds, but the value is not a cached session.
		testMap.set(session2.token, "null");

		// findSessions should still return session1 and session3
		const sessions = await testInternalAdapter.findSessions([
			session1.token,
			session2.token,
			session3.token,
		]);
		expect(sessions.length).toBe(2);
		expect(sessions.map((s) => s.session.token).sort()).toEqual(
			[session1.token, session3.token].sort(),
		);
	});

	it("should update session and active-sessions list in secondary storage", async () => {
		const testMap = new Map<string, string>();
		const testExpirationMap = new Map<string, number>();

		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: createStringSecondaryStorage(
				testMap,
				testExpirationMap,
			),
		} satisfies BetterAuthOptions;

		// Run migrations for the new database
		(await getMigrations(testOpts)).runMigrations();

		const testCtx = await init(testOpts);
		const testInternalAdapter = testCtx.internalAdapter;

		// Create a user first
		const user = await testInternalAdapter.createUser(
			{
				name: "test-user-update",
				email: "test-update@email.com",
			},
			{ method: "test" },
		);

		// Create a session
		const session = await testInternalAdapter.createSession(user.id);

		// Verify session is in secondary storage
		const storedSessionStr = testMap.get(session.token);
		expect(storedSessionStr).toBeDefined();

		const storedSession = safeJSONParse<{
			session: Session;
			user: User;
		}>(storedSessionStr!);

		expect(storedSession?.session.ipAddress).toBe("");

		// Get initial active-sessions list
		const initialListStr = testMap.get(`active-sessions-${user.id}`);
		expect(initialListStr).toBeDefined();
		const initialList = safeJSONParse<{ token: string; expiresAt: number }[]>(
			initialListStr!,
		);
		expect(initialList).toBeDefined();
		expect(initialList!.length).toBe(1);
		const initialExpiresAt = initialList![0]!.expiresAt;

		// Update the session with new ipAddress and expiresAt
		const updatedIpAddress = "192.168.1.1";
		const newExpiresAt = new Date(initialExpiresAt + 60 * 60 * 1000);
		await testInternalAdapter.updateSession(session.token, {
			ipAddress: updatedIpAddress,
			expiresAt: newExpiresAt,
		});

		// Get the session from secondary storage again
		const updatedStoredSessionStr = testMap.get(session.token);
		expect(updatedStoredSessionStr).toBeDefined();

		const updatedStoredSession = safeJSONParse<{
			session: Session;
			user: User;
		}>(updatedStoredSessionStr!);

		// The session in secondary storage MUST have the updated data
		expect(updatedStoredSession?.session.ipAddress).toBe(updatedIpAddress);

		// User should still be intact
		expect(updatedStoredSession?.user.id).toBe(user.id);

		// Get updated active-sessions list
		const updatedListStr = testMap.get(`active-sessions-${user.id}`);
		expect(updatedListStr).toBeDefined();
		const updatedList = safeJSONParse<{ token: string; expiresAt: number }[]>(
			updatedListStr!,
		);
		expect(updatedList).toBeDefined();

		// The expiresAt in active-sessions list should be updated
		expect(updatedList!.length).toBe(1);
		expect(updatedList![0]!.token).toBe(session.token);
		expect(updatedList![0]!.expiresAt).toBe(newExpiresAt.getTime());

		// TTL should also be updated
		const updatedTTL = testExpirationMap.get(`active-sessions-${user.id}`);
		const expectedTTL = Math.floor(
			(newExpiresAt.getTime() - Date.now()) / 1000,
		);
		expect(updatedTTL).toBeDefined();
		expect(updatedTTL! - expectedTTL).toBeLessThanOrEqual(1);
		expect(updatedTTL! - expectedTTL).toBeGreaterThanOrEqual(0);
	});

	it("should evict an expired session from secondary storage when it is updated", async () => {
		const testMap = new Map<string, string>();
		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: createStringSecondaryStorage(testMap),
		} satisfies BetterAuthOptions;
		(await getMigrations(testOpts)).runMigrations();
		const testInternalAdapter = (await init(testOpts)).internalAdapter;
		const user = await testInternalAdapter.createUser(
			{
				name: "test-user-expired-update",
				email: "test-expired-update@email.com",
			},
			{ method: "test" },
		);
		const expiredSession = await testInternalAdapter.createSession(user.id);
		const liveSession = await testInternalAdapter.createSession(user.id);

		await testInternalAdapter.updateSession(expiredSession.token, {
			expiresAt: new Date(Date.now() - 1_000),
		});

		expect(testMap.has(expiredSession.token)).toBe(false);
		expect(testMap.has(liveSession.token)).toBe(true);
		const activeSessions = safeJSONParse<
			{ token: string; expiresAt: number }[]
		>(testMap.get(`active-sessions-${user.id}`)!);
		expect(activeSessions?.map(({ token }) => token)).toEqual([
			liveSession.token,
		]);
		await expect(
			testInternalAdapter.findSession(expiredSession.token),
		).resolves.toBeNull();
	});

	it("should deduplicate sessions when active-sessions list contains duplicates", async () => {
		const testMap = new Map<string, string>();
		const testExpirationMap = new Map<string, number>();

		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: createStringSecondaryStorage(
				testMap,
				testExpirationMap,
			),
		} satisfies BetterAuthOptions;

		(await getMigrations(testOpts)).runMigrations();
		const testAuthContext = await init(testOpts);
		const testInternalAdapter = testAuthContext.internalAdapter;

		// Create a user
		const user = await testInternalAdapter.createUser(
			{
				name: "corrupt-sessions-test-user",
				email: "corrupt-sessions-test@example.com",
			},
			{ method: "test" },
		);

		// Create a session
		const session = await testInternalAdapter.createSession(user.id);

		// Manually corrupt the active-sessions list by adding duplicate tokens
		const listStr = testMap.get(`active-sessions-${user.id}`);
		const list = safeJSONParse<{ token: string; expiresAt: number }[]>(
			listStr!,
		);

		// Add duplicates of the same token
		const corruptedList = [
			...list!,
			{ token: session.token, expiresAt: session.expiresAt.getTime() },
			{ token: session.token, expiresAt: session.expiresAt.getTime() },
		];
		testMap.set(`active-sessions-${user.id}`, JSON.stringify(corruptedList));

		// Verify corruption
		const corruptedListStr = testMap.get(`active-sessions-${user.id}`);
		const parsed = safeJSONParse<{ token: string; expiresAt: number }[]>(
			corruptedListStr!,
		);
		expect(parsed!.length).toBe(3); // 1 original + 2 duplicates

		// listSessions should deduplicate and return only unique sessions
		const sessions = await testInternalAdapter.listSessions(user.id);
		expect(sessions.length).toBe(1);
	});

	describe("verification secondary storage", () => {
		function createMockStorage() {
			const dataMap = new Map<string, string>();
			const ttlMap = new Map<string, number>();
			return {
				dataMap,
				ttlMap,
				storage: createStringSecondaryStorage(dataMap, ttlMap),
			};
		}

		it("should store verification in secondary storage by default", async () => {
			const { dataMap, ttlMap, storage } = createMockStorage();

			const secondaryOnlyOpts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(secondaryOnlyOpts)).runMigrations();
			const ctx = await init(secondaryOnlyOpts);

			const verification = await ctx.internalAdapter.createVerificationValue({
				identifier: "test-verification",
				value: "test-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			expect(dataMap.has(`verification:${verification.identifier}`)).toBe(true);
			expect(ttlMap.has(`verification:${verification.identifier}`)).toBe(true);
		});

		it("should find verification from secondary storage", async () => {
			const { storage } = createMockStorage();

			const secondaryOnlyOpts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(secondaryOnlyOpts)).runMigrations();
			const ctx = await init(secondaryOnlyOpts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "find-test",
				value: "find-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			const found =
				await ctx.internalAdapter.findVerificationValue("find-test");
			expect(found).not.toBeNull();
			expect(found?.identifier).toBe("find-test");
			expect(found?.value).toBe("find-value");
		});

		it("should NOT store in database when secondary-only mode", async () => {
			const { dataMap, storage } = createMockStorage();

			const secondaryOnlyOpts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(secondaryOnlyOpts)).runMigrations();
			const ctx = await init(secondaryOnlyOpts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "secondary-only-test",
				value: "test-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			expect(dataMap.has("verification:secondary-only-test")).toBe(true);

			dataMap.clear();
			const found = await ctx.internalAdapter.findVerificationValue(
				"secondary-only-test",
			);
			expect(found).toBeNull(); // Proves DB was NOT used
		});

		it("should delete verification from secondary storage", async () => {
			const { dataMap, storage } = createMockStorage();

			const secondaryOnlyOpts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(secondaryOnlyOpts)).runMigrations();
			const ctx = await init(secondaryOnlyOpts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "delete-test",
				value: "delete-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			expect(dataMap.has("verification:delete-test")).toBe(true);

			await ctx.internalAdapter.deleteVerificationByIdentifier("delete-test");

			expect(dataMap.has("verification:delete-test")).toBe(false);
		});

		it("should store in both when storeInDatabase is true", async () => {
			const { dataMap, storage } = createMockStorage();

			const dualStorageOpts = {
				database: new DatabaseSync(":memory:"),
				verification: {
					storeInDatabase: true,
				},
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(dualStorageOpts)).runMigrations();
			const ctx = await init(dualStorageOpts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "both-test",
				value: "both-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			expect(dataMap.has("verification:both-test")).toBe(true);

			dataMap.clear();
			const found =
				await ctx.internalAdapter.findVerificationValue("both-test");
			expect(found).not.toBeNull();
			expect(found?.value).toBe("both-value");
		});

		it("should fallback to database when not in secondary storage", async () => {
			const { dataMap, storage } = createMockStorage();

			const dualStorageOpts = {
				database: new DatabaseSync(":memory:"),
				verification: {
					storeInDatabase: true,
				},
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(dualStorageOpts)).runMigrations();
			const ctx = await init(dualStorageOpts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "fallback-test",
				value: "fallback-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			dataMap.clear();

			const found =
				await ctx.internalAdapter.findVerificationValue("fallback-test");
			expect(found).not.toBeNull();
			expect(found?.value).toBe("fallback-value");
		});

		it("should set correct TTL based on expiresAt", async () => {
			const { ttlMap, storage } = createMockStorage();

			const secondaryOnlyOpts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(secondaryOnlyOpts)).runMigrations();
			const ctx = await init(secondaryOnlyOpts);

			const expiresIn = 300000; // 5 minutes in ms
			const expiresAt = new Date(Date.now() + expiresIn);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "ttl-test",
				value: "ttl-value",
				expiresAt,
			});

			const ttl = ttlMap.get("verification:ttl-test");
			expect(ttl).toBeDefined();
			expect(ttl).toBeGreaterThanOrEqual(298);
			expect(ttl).toBeLessThanOrEqual(300);
		});
	});

	describe("safeJSONParse date revival in secondary storage", () => {
		/**
		 * Simulates a Redis client that auto-parses JSON (e.g. ioredis with
		 * certain configurations). The `get` method returns a pre-parsed object
		 * where date fields are still ISO 8601 strings, not Date instances.
		 */
		function createPreParsedStorage() {
			const dataMap = new Map<string, unknown>();
			const ttlMap = new Map<string, number>();
			return {
				dataMap,
				ttlMap,
				storage: {
					set(key: string, value: string, ttl?: number) {
						// Store as pre-parsed object (simulating Redis auto-parse)
						dataMap.set(key, JSON.parse(value));
						if (ttl) ttlMap.set(key, ttl);
					},
					get(key: string) {
						return dataMap.get(key) ?? null;
					},
					getAndDelete(key: string) {
						const value = dataMap.get(key) ?? null;
						dataMap.delete(key);
						ttlMap.delete(key);
						return value;
					},
					increment(key: string, ttl: number) {
						const current = Number(dataMap.get(key) ?? 0);
						const count = Number.isFinite(current) ? current + 1 : 1;
						dataMap.set(key, count);
						if (current === 0) ttlMap.set(key, ttl);
						return count;
					},
					delete(key: string) {
						dataMap.delete(key);
						ttlMap.delete(key);
					},
				},
			};
		}

		it("should return Date objects from findVerificationValue when storage returns pre-parsed objects", async () => {
			const { storage } = createPreParsedStorage();

			const opts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(opts)).runMigrations();
			const ctx = await init(opts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "date-test",
				value: "test-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			const found =
				await ctx.internalAdapter.findVerificationValue("date-test");
			expect(found).not.toBeNull();
			expect(found!.expiresAt).toBeInstanceOf(Date);
			expect(found!.createdAt).toBeInstanceOf(Date);
			expect(found!.updatedAt).toBeInstanceOf(Date);
		});

		it("should correctly detect expired verification when storage returns pre-parsed objects", async () => {
			const { storage } = createPreParsedStorage();

			const opts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			await (await getMigrations(opts)).runMigrations();
			const ctx = await init(opts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "expiry-check",
				value: "test-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			const found =
				await ctx.internalAdapter.findVerificationValue("expiry-check");
			expect(found).not.toBeNull();
			// This comparison would silently fail if expiresAt were a string
			// because string < Date coerces to NaN, making it always false
			expect(found!.expiresAt > new Date()).toBe(true);
			expect(found!.expiresAt < new Date(Date.now() + 120000)).toBe(true);
		});

		it("should return Date objects for all date fields across multiple reads", async () => {
			const { storage } = createPreParsedStorage();

			const opts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			await (await getMigrations(opts)).runMigrations();
			const ctx = await init(opts);

			const expiresAt = new Date(Date.now() + 60000);
			await ctx.internalAdapter.createVerificationValue({
				identifier: "multi-read-test",
				value: "test-value",
				expiresAt,
			});

			// First read: safeJSONParse receives pre-parsed object from storage
			const first =
				await ctx.internalAdapter.findVerificationValue("multi-read-test");
			expect(first).not.toBeNull();
			expect(first!.expiresAt).toBeInstanceOf(Date);
			expect(first!.createdAt).toBeInstanceOf(Date);
			expect(first!.updatedAt).toBeInstanceOf(Date);

			// Second read: verify consistency (the stored object wasn't mutated)
			const second =
				await ctx.internalAdapter.findVerificationValue("multi-read-test");
			expect(second).not.toBeNull();
			expect(second!.expiresAt).toBeInstanceOf(Date);
			expect(second!.expiresAt.getTime()).toBe(first!.expiresAt.getTime());
		});

		it("should preserve non-date string fields when reviving dates", async () => {
			const { storage } = createPreParsedStorage();

			const opts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			await (await getMigrations(opts)).runMigrations();
			const ctx = await init(opts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "string-field-test",
				value: "my-token-value-123",
				expiresAt: new Date(Date.now() + 60000),
			});

			const found =
				await ctx.internalAdapter.findVerificationValue("string-field-test");
			expect(found).not.toBeNull();
			// Non-date strings must NOT be converted
			expect(found!.identifier).toBe("string-field-test");
			expect(typeof found!.identifier).toBe("string");
			expect(found!.value).toBe("my-token-value-123");
			expect(typeof found!.value).toBe("string");
			// Date strings MUST be converted
			expect(found!.expiresAt).toBeInstanceOf(Date);
		});
	});

	describe("consumeVerificationValue", () => {
		async function makeAdapter(overrides?: Partial<BetterAuthOptions>) {
			const opts = {
				database: new DatabaseSync(":memory:"),
				...overrides,
			} satisfies BetterAuthOptions;
			(await getMigrations(opts)).runMigrations();
			const ctx = await init(opts);
			return ctx.internalAdapter;
		}

		it("fails closed across independent adapters without identifier-wide atomicity", async () => {
			const database = new DatabaseSync(":memory:");
			const kysely = new Kysely({
				dialect: new NodeSqliteDialect({ database }),
			});
			const beforeDelete = vi.fn();
			const options = {
				database: { db: kysely, type: "sqlite", transaction: false },
				databaseHooks: {
					verification: {
						delete: { before: beforeDelete },
					},
				},
			} satisfies BetterAuthOptions;
			await (await getMigrations(options)).runMigrations();
			const [firstContext, secondContext] = await Promise.all([
				init(options),
				init(options),
			]);

			await firstContext.internalAdapter.createVerificationValue({
				identifier: "consume:non-atomic",
				value: "older",
				expiresAt: new Date(Date.now() + 60_000),
			});
			await firstContext.internalAdapter.createVerificationValue({
				identifier: "consume:non-atomic",
				value: "newer",
				expiresAt: new Date(Date.now() + 60_000),
			});
			const firstFindMany = vi.spyOn(firstContext.adapter, "findMany");
			const secondFindMany = vi.spyOn(secondContext.adapter, "findMany");

			const attempts = await Promise.allSettled([
				firstContext.internalAdapter.consumeVerificationValue(
					"consume:non-atomic",
				),
				secondContext.internalAdapter.consumeVerificationValue(
					"consume:non-atomic",
				),
			]);

			for (const attempt of attempts) {
				expect(attempt.status).toBe("rejected");
				if (attempt.status === "rejected") {
					expect(attempt.reason).toMatchObject({
						code: ATOMIC_WRITES_UNSUPPORTED,
					});
				}
			}
			expect(firstFindMany).not.toHaveBeenCalled();
			expect(secondFindMany).not.toHaveBeenCalled();
			expect(beforeDelete).not.toHaveBeenCalled();
			await expect(
				firstContext.adapter.count({
					model: "verification",
					where: [{ field: "identifier", value: "consume:non-atomic" }],
				}),
			).resolves.toBe(2);

			await kysely.destroy();
		});

		it("atomically gates the winner and invalidates every row for the identifier", async () => {
			const { atomicWrites, context, kysely } =
				await createAtomicWriteTestContext();
			const older = await context.internalAdapter.createVerificationValue({
				identifier: "consume:atomic-batch",
				value: "older",
				expiresAt: new Date(Date.now() + 60_000),
			});
			await new Promise((resolve) => setTimeout(resolve, 5));
			const latest = await context.internalAdapter.createVerificationValue({
				identifier: "consume:atomic-batch",
				value: "newer",
				expiresAt: new Date(Date.now() + 60_000),
			});
			atomicWrites.submittedBatches.length = 0;

			await expect(
				context.internalAdapter.consumeVerificationValue(
					"consume:atomic-batch",
				),
			).resolves.toMatchObject({ id: latest.id, value: "newer" });

			expect(atomicWrites.submittedBatches).toHaveLength(1);
			expect(atomicWrites.submittedBatches[0]).toEqual([
				{
					type: "delete",
					model: "verification",
					where: [
						{ field: "id", value: latest.id },
						{ field: "identifier", value: latest.identifier },
						{ field: "value", value: latest.value },
						{ field: "expiresAt", value: latest.expiresAt },
						{ field: "createdAt", value: latest.createdAt },
						{ field: "updatedAt", value: latest.updatedAt },
					],
				},
				{
					type: "deleteMany",
					model: "verification",
					where: [{ field: "id", operator: "in", value: [older.id] }],
				},
			]);
			await expect(
				context.adapter.count({
					model: "verification",
					where: [{ field: "identifier", value: "consume:atomic-batch" }],
				}),
			).resolves.toBe(0);

			await kysely.destroy();
		});

		it("captures and invalidates identifier snapshots beyond the initial read limit", async () => {
			const { atomicWrites, context, kysely } =
				await createAtomicWriteTestContext();
			const identifier = "consume:large-atomic-snapshot";
			for (let index = 0; index < 130; index += 1) {
				await context.internalAdapter.createVerificationValue({
					identifier,
					value: `value-${index}`,
					expiresAt: new Date(Date.now() + 60_000),
				});
			}
			atomicWrites.submittedBatches.length = 0;

			await expect(
				context.internalAdapter.consumeVerificationValue(identifier),
			).resolves.not.toBeNull();

			const submittedBatch = atomicWrites.submittedBatches[0];
			expect(submittedBatch?.map((operation) => operation.type)).toEqual([
				"delete",
				"deleteMany",
				"deleteMany",
			]);
			expect(submittedBatch?.[1]).toMatchObject({
				where: [{ field: "id", operator: "in", value: expect.any(Array) }],
			});
			const firstSiblingDelete = submittedBatch?.[1];
			const secondSiblingDelete = submittedBatch?.[2];
			if (
				firstSiblingDelete?.type !== "deleteMany" ||
				secondSiblingDelete?.type !== "deleteMany"
			) {
				throw new Error(
					"The verification snapshot should use chunked deletions",
				);
			}
			expect(firstSiblingDelete.where[0]?.value).toHaveLength(100);
			expect(secondSiblingDelete.where[0]?.value).toHaveLength(29);
			await expect(
				context.adapter.count({
					model: "verification",
					where: [{ field: "identifier", value: identifier }],
				}),
			).resolves.toBe(0);

			await kysely.destroy();
		});

		it("has exactly one winner across independent atomic-batch adapters", async () => {
			const database = new DatabaseSync(":memory:");
			const kysely = new Kysely({
				dialect: new NodeSqliteDialect({ database }),
			});
			const afterDelete = vi.fn();
			const options = {
				database: { db: kysely, type: "sqlite", transaction: false },
				databaseHooks: {
					verification: {
						delete: { after: afterDelete },
					},
				},
			} satisfies BetterAuthOptions;
			await (await getMigrations(options)).runMigrations();
			const [firstContext, secondContext] = await Promise.all([
				init(options),
				init(options),
			]);
			const atomicWrites = decorateAdapterWithAtomicWrites(
				firstContext.adapter,
				database,
			);
			secondContext.adapter.commitAtomicWrites =
				firstContext.adapter.commitAtomicWrites;

			await firstContext.internalAdapter.createVerificationValue({
				identifier: "consume:independent-batches",
				value: "older",
				expiresAt: new Date(Date.now() + 60_000),
			});
			await new Promise((resolve) => setTimeout(resolve, 5));
			await firstContext.internalAdapter.createVerificationValue({
				identifier: "consume:independent-batches",
				value: "newer",
				expiresAt: new Date(Date.now() + 60_000),
			});
			atomicWrites.submittedBatches.length = 0;

			const results = await Promise.all([
				firstContext.internalAdapter.consumeVerificationValue(
					"consume:independent-batches",
				),
				secondContext.internalAdapter.consumeVerificationValue(
					"consume:independent-batches",
				),
			]);

			const winners = results.filter((result) => result !== null);
			expect(winners).toHaveLength(1);
			expect(winners[0]?.value).toBe("newer");
			expect(atomicWrites.submittedBatches).toHaveLength(2);
			expect(afterDelete).toHaveBeenCalledOnce();
			await expect(
				firstContext.adapter.count({
					model: "verification",
					where: [
						{
							field: "identifier",
							value: "consume:independent-batches",
						},
					],
				}),
			).resolves.toBe(0);

			await kysely.destroy();
		});

		it("keeps a replacement created after a losing atomic batch snapshot", async () => {
			const database = new DatabaseSync(":memory:");
			const kysely = new Kysely({
				dialect: new NodeSqliteDialect({ database }),
			});
			const options = {
				database: { db: kysely, type: "sqlite", transaction: false },
			} satisfies BetterAuthOptions;
			await (await getMigrations(options)).runMigrations();
			const [firstContext, secondContext] = await Promise.all([
				init(options),
				init(options),
			]);
			decorateAdapterWithAtomicWrites(firstContext.adapter, database);
			const commitAtomicWrites = firstContext.adapter.commitAtomicWrites;
			if (!commitAtomicWrites) {
				throw new Error("The atomic test adapter should expose batch writes");
			}

			let releaseLosingBatch = () => {};
			let markLosingBatchReady = () => {};
			let losingBatchOperations: readonly AtomicWriteOperation[] | undefined;
			const losingBatchReady = new Promise<void>((resolve) => {
				markLosingBatchReady = resolve;
			});
			const continueLosingBatch = new Promise<void>((resolve) => {
				releaseLosingBatch = resolve;
			});
			let preparedBatchCount = 0;
			const commitWithDelayedSecondBatch: typeof commitAtomicWrites = async (
				operations,
			) => {
				preparedBatchCount++;
				if (preparedBatchCount === 2) {
					losingBatchOperations = operations;
					markLosingBatchReady();
					await continueLosingBatch;
				}
				return commitAtomicWrites(operations);
			};
			firstContext.adapter.commitAtomicWrites = commitWithDelayedSecondBatch;
			secondContext.adapter.commitAtomicWrites = commitWithDelayedSecondBatch;

			const identifier = "consume:replacement-after-snapshot";
			const older = await firstContext.internalAdapter.createVerificationValue({
				identifier,
				value: "older",
				expiresAt: new Date(Date.now() + 60_000),
			});
			await new Promise((resolve) => setTimeout(resolve, 5));
			const latest = await firstContext.internalAdapter.createVerificationValue(
				{
					identifier,
					value: "latest",
					expiresAt: new Date(Date.now() + 60_000),
				},
			);

			const firstAttempt =
				firstContext.internalAdapter.consumeVerificationValue(identifier);
			const secondAttempt =
				secondContext.internalAdapter.consumeVerificationValue(identifier);
			await losingBatchReady;
			const winningResult = await Promise.race([firstAttempt, secondAttempt]);
			expect(winningResult).toMatchObject({ id: latest.id, value: "latest" });

			const replacement =
				await firstContext.internalAdapter.createVerificationValue({
					identifier,
					value: "replacement",
					expiresAt: new Date(Date.now() + 60_000),
				});
			releaseLosingBatch();

			const results = await Promise.all([firstAttempt, secondAttempt]);
			expect(results.filter((result) => result !== null)).toHaveLength(1);
			expect(losingBatchOperations).toEqual([
				{
					type: "delete",
					model: "verification",
					where: [
						{ field: "id", value: latest.id },
						{ field: "identifier", value: latest.identifier },
						{ field: "value", value: latest.value },
						{ field: "expiresAt", value: latest.expiresAt },
						{ field: "createdAt", value: latest.createdAt },
						{ field: "updatedAt", value: latest.updatedAt },
					],
				},
				{
					type: "deleteMany",
					model: "verification",
					where: [{ field: "id", operator: "in", value: [older.id] }],
				},
			]);
			await expect(
				firstContext.internalAdapter.findVerificationValue(identifier),
			).resolves.toMatchObject({
				id: replacement.id,
				value: "replacement",
			});

			await kysely.destroy();
		});

		it("does not consume a verification row updated after the batch snapshot", async () => {
			const afterDelete = vi.fn();
			const { context, kysely } = await createAtomicWriteTestContext({
				databaseHooks: {
					verification: {
						delete: { after: afterDelete },
					},
				},
			});
			const commitAtomicWrites = context.adapter.commitAtomicWrites;
			if (!commitAtomicWrites) {
				throw new Error("The atomic test adapter should expose batch writes");
			}

			let releaseBatch = () => {};
			let markBatchReady = () => {};
			const batchReady = new Promise<void>((resolve) => {
				markBatchReady = resolve;
			});
			const continueBatch = new Promise<void>((resolve) => {
				releaseBatch = resolve;
			});
			context.adapter.commitAtomicWrites = async (operations) => {
				markBatchReady();
				await continueBatch;
				return commitAtomicWrites(operations);
			};

			const identifier = "consume:updated-after-snapshot";
			await context.internalAdapter.createVerificationValue({
				identifier,
				value: "original",
				expiresAt: new Date(Date.now() + 60_000),
			});
			const consumeAttempt =
				context.internalAdapter.consumeVerificationValue(identifier);
			await batchReady;

			const renewedExpiresAt = new Date(Date.now() + 120_000);
			await context.internalAdapter.updateVerificationByIdentifier(identifier, {
				value: "renewed",
				expiresAt: renewedExpiresAt,
				updatedAt: new Date(),
			});
			releaseBatch();

			await expect(consumeAttempt).resolves.toBeNull();
			expect(afterDelete).not.toHaveBeenCalled();
			await expect(
				context.internalAdapter.findVerificationValue(identifier),
			).resolves.toMatchObject({
				identifier,
				value: "renewed",
				expiresAt: renewedExpiresAt,
			});

			await kysely.destroy();
		});

		it("fails before hooks and writes when an identifier snapshot exceeds the atomic bound", async () => {
			const beforeDelete = vi.fn();
			const { atomicWrites, context, database, kysely } =
				await createAtomicWriteTestContext({
					databaseHooks: {
						verification: {
							delete: { before: beforeDelete },
						},
					},
				});
			const identifier = "consume:oversized-snapshot";
			const createdAt = new Date();
			const expiresAt = new Date(Date.now() + 60_000);
			database
				.prepare(
					`WITH RECURSIVE sequence(position) AS (
						VALUES (0)
						UNION ALL
						SELECT position + 1 FROM sequence WHERE position < 4095
					)
					INSERT INTO "verification" (
						"id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"
					)
					SELECT
						'oversized-' || position,
						?,
						'value-' || position,
						?,
						?,
						?
					FROM sequence`,
				)
				.run(
					identifier,
					expiresAt.toISOString(),
					createdAt.toISOString(),
					createdAt.toISOString(),
				);

			await expect(
				context.internalAdapter.consumeVerificationValue(identifier),
			).rejects.toThrow(
				"Verification identifier has too many rows to consume atomically.",
			);
			expect(beforeDelete).not.toHaveBeenCalled();
			expect(atomicWrites.submittedBatches).toHaveLength(0);
			await expect(
				context.adapter.count({
					model: "verification",
					where: [{ field: "identifier", value: identifier }],
				}),
			).resolves.toBe(4096);

			await kysely.destroy();
		});

		it("does not submit an atomic batch when a delete.before hook vetoes consumption", async () => {
			const beforeDelete = vi.fn(async () => false as const);
			const { atomicWrites, context, kysely } =
				await createAtomicWriteTestContext({
					databaseHooks: {
						verification: {
							delete: { before: beforeDelete },
						},
					},
				});
			await context.internalAdapter.createVerificationValue({
				identifier: "consume:atomic-veto",
				value: "kept",
				expiresAt: new Date(Date.now() + 60_000),
			});
			atomicWrites.submittedBatches.length = 0;

			await expect(
				context.internalAdapter.consumeVerificationValue("consume:atomic-veto"),
			).resolves.toBeNull();

			expect(beforeDelete).toHaveBeenCalledOnce();
			expect(atomicWrites.submittedBatches).toHaveLength(0);
			await expect(
				context.adapter.count({
					model: "verification",
					where: [{ field: "identifier", value: "consume:atomic-veto" }],
				}),
			).resolves.toBe(1);

			await kysely.destroy();
		});

		it("returns the row to the first caller and null to subsequent reads", async () => {
			const adapter = await makeAdapter();
			await adapter.createVerificationValue({
				identifier: "consume:single",
				value: "user-1",
				expiresAt: new Date(Date.now() + 60_000),
			});

			const first = await adapter.consumeVerificationValue("consume:single");
			expect(first).not.toBeNull();
			expect(first!.value).toBe("user-1");

			const second = await adapter.consumeVerificationValue("consume:single");
			expect(second).toBeNull();
		});

		it("yields exactly one winner under concurrent consume", async () => {
			const adapter = await makeAdapter();
			await adapter.createVerificationValue({
				identifier: "consume:race",
				value: "user-2",
				expiresAt: new Date(Date.now() + 60_000),
			});

			const results = await Promise.all([
				adapter.consumeVerificationValue("consume:race"),
				adapter.consumeVerificationValue("consume:race"),
				adapter.consumeVerificationValue("consume:race"),
			]);

			const winners = results.filter((r) => r !== null);
			expect(winners).toHaveLength(1);
			expect(winners[0]!.value).toBe("user-2");
		});

		it("returns null for an unknown identifier", async () => {
			const adapter = await makeAdapter();
			const result = await adapter.consumeVerificationValue("consume:missing");
			expect(result).toBeNull();
		});

		it("returns null when the row exists but has already expired", async () => {
			const adapter = await makeAdapter();
			await adapter.createVerificationValue({
				identifier: "consume:expired",
				value: "user-expired",
				expiresAt: new Date(Date.now() - 1_000),
			});

			const result = await adapter.consumeVerificationValue("consume:expired");
			expect(result).toBeNull();

			// The expired row must still be invalidated so a later replay cannot
			// consume it after a cleanup pass.
			const replay = await adapter.findVerificationValue("consume:expired");
			expect(replay).toBeNull();
		});

		it("aborts the consume when a delete.before hook returns false", async () => {
			const veto = vi.fn().mockReturnValue(false);
			const adapter = await makeAdapter({
				databaseHooks: {
					verification: {
						delete: {
							before: veto,
						},
					},
				},
			});
			await adapter.createVerificationValue({
				identifier: "consume:veto",
				value: "user-3",
				expiresAt: new Date(Date.now() + 60_000),
			});

			const result = await adapter.consumeVerificationValue("consume:veto");
			expect(result).toBeNull();
			expect(veto).toHaveBeenCalledTimes(1);

			const stillThere = await adapter.findVerificationValue("consume:veto");
			expect(stillThere).not.toBeNull();
		});

		it("fires delete.after only for the winning racer", async () => {
			const afterHook = vi.fn();
			const adapter = await makeAdapter({
				databaseHooks: {
					verification: {
						delete: {
							after: afterHook,
						},
					},
				},
			});
			await adapter.createVerificationValue({
				identifier: "consume:after-once",
				value: "user-4",
				expiresAt: new Date(Date.now() + 60_000),
			});

			const results = await Promise.all([
				adapter.consumeVerificationValue("consume:after-once"),
				adapter.consumeVerificationValue("consume:after-once"),
			]);

			expect(results.filter((r) => r !== null)).toHaveLength(1);
			expect(afterHook).toHaveBeenCalledTimes(1);
		});

		it("consumes via the original identifier when storeIdentifier is hashed", async () => {
			const adapter = await makeAdapter({
				verification: { storeIdentifier: "hashed" },
			});
			await adapter.createVerificationValue({
				identifier: "consume:hashed",
				value: "user-5",
				expiresAt: new Date(Date.now() + 60_000),
			});

			const result = await adapter.consumeVerificationValue("consume:hashed");
			expect(result).not.toBeNull();
			expect(result!.value).toBe("user-5");

			const replay = await adapter.consumeVerificationValue("consume:hashed");
			expect(replay).toBeNull();
		});

		it("consumes the latest row and invalidates stale rows for the identifier", async () => {
			const adapter = await makeAdapter();
			await adapter.createVerificationValue({
				identifier: "consume:multi",
				value: "older",
				expiresAt: new Date(Date.now() + 60_000),
			});
			await new Promise((resolve) => setTimeout(resolve, 5));
			await adapter.createVerificationValue({
				identifier: "consume:multi",
				value: "newer",
				expiresAt: new Date(Date.now() + 60_000),
			});

			const consumed = await adapter.consumeVerificationValue("consume:multi");
			expect(consumed).not.toBeNull();
			expect(consumed!.value).toBe("newer");

			const leftover = await adapter.findVerificationValue("consume:multi");
			expect(leftover).toBeNull();
		});

		it("uses secondary storage getAndDelete when verification values are storage-only", async () => {
			const store = new Map<string, string>();
			const getAndDelete = vi.fn((key: string) => {
				const value = store.get(key) ?? null;
				store.delete(key);
				return value;
			});
			const adapter = await makeAdapter({
				verification: { storeInDatabase: false },
				secondaryStorage: {
					set(key, value) {
						store.set(key, value);
					},
					get(key) {
						return store.get(key) ?? null;
					},
					getAndDelete,
					increment(key) {
						const count = Number(store.get(key) ?? 0) + 1;
						store.set(key, String(count));
						return count;
					},
					delete(key) {
						store.delete(key);
					},
				},
			});
			await adapter.createVerificationValue({
				identifier: "consume:secondary",
				value: "secondary-user",
				expiresAt: new Date(Date.now() + 60_000),
			});

			const results = await Promise.all([
				adapter.consumeVerificationValue("consume:secondary"),
				adapter.consumeVerificationValue("consume:secondary"),
			]);

			expect(results.filter((r) => r !== null)).toHaveLength(1);
			expect(results.find((r) => r !== null)?.value).toBe("secondary-user");
			expect(getAndDelete).toHaveBeenCalledWith(
				"verification:consume:secondary",
			);
			expect(store.has("verification:consume:secondary")).toBe(false);
		});

		it("returns null when the secondary storage row has already expired", async () => {
			const store = new Map<string, string>();
			const adapter = await makeAdapter({
				verification: { storeInDatabase: false },
				secondaryStorage: createStringSecondaryStorage(store),
			});

			// Bypass `createVerificationValue`'s TTL gate by writing directly
			// with an `expiresAt` already in the past. This mirrors a row that
			// was valid when written but reached the consume call after expiry.
			store.set(
				"verification:consume:secondary-expired",
				JSON.stringify({
					id: "row-id",
					identifier: "consume:secondary-expired",
					value: "secondary-expired-user",
					expiresAt: new Date(Date.now() - 1_000),
					createdAt: new Date(),
					updatedAt: new Date(),
				}),
			);

			const result = await adapter.consumeVerificationValue(
				"consume:secondary-expired",
			);
			expect(result).toBeNull();
			// The expired row is still consumed (deleted) so it cannot be
			// replayed later.
			expect(store.has("verification:consume:secondary-expired")).toBe(false);
		});

		it("rehydrates string `expiresAt` from secondary storage JSON", async () => {
			const store = new Map<string, string>();
			const adapter = await makeAdapter({
				verification: { storeInDatabase: false },
				secondaryStorage: createStringSecondaryStorage(store),
			});
			await adapter.createVerificationValue({
				identifier: "consume:secondary-hydrate",
				value: "hydrate-user",
				expiresAt: new Date(Date.now() + 60_000),
			});

			const result = await adapter.consumeVerificationValue(
				"consume:secondary-hydrate",
			);
			expect(result).not.toBeNull();
			expect(result!.value).toBe("hydrate-user");
			expect(result!.expiresAt).toBeInstanceOf(Date);
			expect(result!.expiresAt.getTime()).toBeGreaterThan(Date.now());
		});

		it("returns null when secondary storage `expiresAt` cannot be parsed", async () => {
			const store = new Map<string, string>();
			const adapter = await makeAdapter({
				verification: { storeInDatabase: false },
				secondaryStorage: createStringSecondaryStorage(store),
			});

			store.set(
				"verification:consume:secondary-invalid-date",
				JSON.stringify({
					id: "row-id",
					identifier: "consume:secondary-invalid-date",
					value: "bad-row",
					expiresAt: "not-a-date",
					createdAt: new Date(),
					updatedAt: new Date(),
				}),
			);

			const result = await adapter.consumeVerificationValue(
				"consume:secondary-invalid-date",
			);
			expect(result).toBeNull();
		});
	});

	describe("reserveVerificationValue", () => {
		async function makeAdapter(overrides?: Partial<BetterAuthOptions>) {
			const opts = {
				database: new DatabaseSync(":memory:"),
				...overrides,
			} satisfies BetterAuthOptions;
			(await getMigrations(opts)).runMigrations();
			const ctx = await init(opts);
			return ctx.internalAdapter;
		}

		it("returns true the first time and the row is findable", async () => {
			const adapter = await makeAdapter();

			const reserved = await adapter.reserveVerificationValue({
				identifier: "reserve:fresh",
				value: "jti-1",
				expiresAt: new Date(Date.now() + 60_000),
			});
			expect(reserved).toBe(true);

			const found = await adapter.findVerificationValue("reserve:fresh");
			expect(found).not.toBeNull();
			expect(found!.value).toBe("jti-1");
		});

		it("returns false the second time for the same identifier", async () => {
			const adapter = await makeAdapter();

			const first = await adapter.reserveVerificationValue({
				identifier: "reserve:once",
				value: "jti-2",
				expiresAt: new Date(Date.now() + 60_000),
			});
			expect(first).toBe(true);

			const second = await adapter.reserveVerificationValue({
				identifier: "reserve:once",
				value: "jti-2-replay",
				expiresAt: new Date(Date.now() + 60_000),
			});
			expect(second).toBe(false);
		});

		it("yields exactly one winner under concurrent reserve", async () => {
			const adapter = await makeAdapter();

			const results = await Promise.all([
				adapter.reserveVerificationValue({
					identifier: "reserve:race",
					value: "jti-3",
					expiresAt: new Date(Date.now() + 60_000),
				}),
				adapter.reserveVerificationValue({
					identifier: "reserve:race",
					value: "jti-3",
					expiresAt: new Date(Date.now() + 60_000),
				}),
			]);

			expect(results.filter((r) => r === true)).toHaveLength(1);
			expect(results.filter((r) => r === false)).toHaveLength(1);
		});

		it("reserves independently across different identifiers", async () => {
			const adapter = await makeAdapter();

			const first = await adapter.reserveVerificationValue({
				identifier: "reserve:independent-a",
				value: "jti-a",
				expiresAt: new Date(Date.now() + 60_000),
			});
			const second = await adapter.reserveVerificationValue({
				identifier: "reserve:independent-b",
				value: "jti-b",
				expiresAt: new Date(Date.now() + 60_000),
			});

			expect(first).toBe(true);
			expect(second).toBe(true);
		});

		it("rolls back reservation writes and their secondary-storage entries", async () => {
			const database = new DatabaseSync(":memory:");
			const secondaryStore = new Map<string, string>();
			const opts = {
				database,
				secondaryStorage: createStringSecondaryStorage(secondaryStore),
				verification: { storeInDatabase: true },
			} satisfies BetterAuthOptions;
			(await getMigrations(opts)).runMigrations();
			const ctx = await init(opts);
			const reservation = {
				identifier: "reserve:rollback",
				value: "jti-rollback",
				expiresAt: new Date(Date.now() + 60_000),
			};

			try {
				await expect(
					runWithTransaction(ctx.adapter, async () => {
						expect(
							await ctx.internalAdapter.reserveVerificationValue(reservation),
						).toBe(true);
						throw new Error("rollback reservation");
					}),
				).rejects.toThrow("rollback reservation");

				expect(secondaryStore.size).toBe(0);
				expect(
					await ctx.internalAdapter.reserveVerificationValue(reservation),
				).toBe(true);
				expect(secondaryStore.size).toBe(1);
			} finally {
				database.close();
			}
		});

		it("fails closed when verification reservation is secondary-storage-only", async () => {
			const adapter = await makeAdapter({
				verification: { storeInDatabase: false },
				secondaryStorage: createStringSecondaryStorage(new Map()),
			});

			await expect(
				adapter.reserveVerificationValue({
					identifier: "reserve:secondary-only",
					value: "jti-secondary",
					expiresAt: new Date(Date.now() + 60_000),
				}),
			).rejects.toThrow(/requires database-backed verification storage/);
		});
	});

	describe("reserveVerificationValue", () => {
		async function makeAdapter(overrides?: Partial<BetterAuthOptions>) {
			const opts = {
				database: new DatabaseSync(":memory:"),
				...overrides,
			} satisfies BetterAuthOptions;
			(await getMigrations(opts)).runMigrations();
			const ctx = await init(opts);
			return ctx.internalAdapter;
		}

		it("returns true the first time and the row is findable", async () => {
			const adapter = await makeAdapter();

			const reserved = await adapter.reserveVerificationValue({
				identifier: "reserve:fresh",
				value: "jti-1",
				expiresAt: new Date(Date.now() + 60_000),
			});
			expect(reserved).toBe(true);

			const found = await adapter.findVerificationValue("reserve:fresh");
			expect(found).not.toBeNull();
			expect(found!.value).toBe("jti-1");
		});

		it("returns false the second time for the same identifier", async () => {
			const adapter = await makeAdapter();

			const first = await adapter.reserveVerificationValue({
				identifier: "reserve:once",
				value: "jti-2",
				expiresAt: new Date(Date.now() + 60_000),
			});
			expect(first).toBe(true);

			const second = await adapter.reserveVerificationValue({
				identifier: "reserve:once",
				value: "jti-2-replay",
				expiresAt: new Date(Date.now() + 60_000),
			});
			expect(second).toBe(false);
		});

		it("yields exactly one winner under concurrent reserve", async () => {
			const adapter = await makeAdapter();

			const results = await Promise.all([
				adapter.reserveVerificationValue({
					identifier: "reserve:race",
					value: "jti-3",
					expiresAt: new Date(Date.now() + 60_000),
				}),
				adapter.reserveVerificationValue({
					identifier: "reserve:race",
					value: "jti-3",
					expiresAt: new Date(Date.now() + 60_000),
				}),
			]);

			expect(results.filter((r) => r === true)).toHaveLength(1);
			expect(results.filter((r) => r === false)).toHaveLength(1);
		});

		it("reserves independently across different identifiers", async () => {
			const adapter = await makeAdapter();

			const first = await adapter.reserveVerificationValue({
				identifier: "reserve:independent-a",
				value: "jti-a",
				expiresAt: new Date(Date.now() + 60_000),
			});
			const second = await adapter.reserveVerificationValue({
				identifier: "reserve:independent-b",
				value: "jti-b",
				expiresAt: new Date(Date.now() + 60_000),
			});

			expect(first).toBe(true);
			expect(second).toBe(true);
		});
	});
});
