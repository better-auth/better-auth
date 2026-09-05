import type { BetterAuthDBSchema } from "@better-auth/core/db";
import { is, Param, SQL, sql } from "drizzle-orm";
import {
	boolean,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { drizzleAdapter } from "./drizzle-adapter";

describe("drizzle-adapter", () => {
	it("resolves physical table and column names for migrations", async () => {
		const account = pgTable("auth_account", {
			accountId: text("account_id").notNull(),
			issuer: text("identity_issuer").notNull(),
			providerId: text("provider_id").notNull(),
		});
		const options = {};
		const adapter = drizzleAdapter(
			{ _: { fullSchema: { account } } } as never,
			{ provider: "pg" },
		)(options);

		const accountSchema = {
			modelName: "account",
			fields: {
				accountId: { type: "string", fieldName: "accountId" },
				providerId: { type: "string", fieldName: "providerId" },
				issuer: { type: "string", fieldName: "issuer" },
			},
		} satisfies BetterAuthDBSchema[string];
		const resolved =
			await adapter.options?.adapterConfig.migrationConnection?.resolvePhysicalSchema?.(
				{ account: accountSchema },
			);

		expect(resolved?.account?.modelName).toBe("auth_account");
		expect(resolved?.account?.fields.accountId?.fieldName).toBe("account_id");
		expect(resolved?.account?.fields.providerId?.fieldName).toBe("provider_id");
		expect(resolved?.account?.fields.issuer?.fieldName).toBe("identity_issuer");
	});

	it("resolves a customized model through its schema key", async () => {
		const account = pgTable("auth_account", {
			accountId: text("account_id").notNull(),
		});
		const adapter = drizzleAdapter(
			{ _: { fullSchema: { account } } } as never,
			{ provider: "pg" },
		)({});

		const resolved =
			await adapter.options?.adapterConfig.migrationConnection?.resolvePhysicalSchema?.(
				{
					account: {
						modelName: "accounts",
						fields: {
							accountId: { type: "string", fieldName: "accountId" },
						},
					},
				},
			);

		expect(resolved?.account?.modelName).toBe("auth_account");
		expect(resolved?.account?.fields.accountId?.fieldName).toBe("account_id");
	});

	it("fails when the configured Drizzle schema is missing migration metadata", async () => {
		const account = pgTable("auth_account", {
			accountId: text("account_id").notNull(),
		});
		const adapter = drizzleAdapter(
			{ _: { fullSchema: { account } } } as never,
			{ provider: "pg" },
		)({});
		const migrationConnection =
			adapter.options?.adapterConfig.migrationConnection;

		await expect(
			migrationConnection?.resolvePhysicalSchema?.({
				account: {
					modelName: "account",
					fields: {
						accountId: { type: "string", fieldName: "accountId" },
						issuer: { type: "string", fieldName: "issuer" },
					},
				},
			}),
		).rejects.toThrow(
			'Drizzle migration schema could not resolve field "issuer" on model "account".',
		);
		await expect(
			migrationConnection?.resolvePhysicalSchema?.({
				jwks: {
					modelName: "jwks",
					fields: { id: { type: "string", fieldName: "id" } },
				},
			}),
		).rejects.toThrow(
			'Drizzle migration schema could not resolve model "jwks".',
		);
	});

	it("should create drizzle adapter", () => {
		const db = {
			_: {
				fullSchema: {},
			},
		} as any;
		const config = {
			provider: "sqlite" as const,
		};
		const adapter = drizzleAdapter(db, config);
		expect(adapter).toBeDefined();
	});

	it("exposes a parameterized migration connection", async () => {
		const all = vi
			.fn()
			.mockResolvedValue([{ providerId: "credential", count: 2 }]);
		const run = vi.fn().mockResolvedValue({ changes: 2 });
		const adapter = drizzleAdapter(
			{
				_: { fullSchema: {} },
				all,
				run,
			} as never,
			{ provider: "sqlite" },
		)({ secret: "test-secret-that-is-at-least-32-chars-long!!" });
		const migrationConnection =
			adapter.options?.adapterConfig.migrationConnection;

		expect(migrationConnection?.dialect).toBe("sqlite");
		await expect(
			migrationConnection?.execute({
				parameters: ["credential"],
				sql: "SELECT providerId, COUNT(*) AS count FROM account WHERE providerId = ?",
			}),
		).resolves.toEqual({
			rows: [{ providerId: "credential", count: 2 }],
		});
		const statement = all.mock.calls[0]?.[0];
		expect(is(statement, SQL)).toBe(true);
		const containsCredentialParameter = (expression: unknown): boolean => {
			if (expression === "credential") return true;
			if (is(expression, Param)) return expression.value === "credential";
			if (!is(expression, SQL)) return false;
			return expression.queryChunks.some(containsCredentialParameter);
		};
		expect(
			(statement as SQL).queryChunks.some(containsCredentialParameter),
		).toBe(true);
		await expect(
			migrationConnection?.execute({
				parameters: ["local:credential"],
				sql: "UPDATE account SET issuer = ?",
			}),
		).resolves.toEqual({
			numAffectedRows: 2n,
			rows: [],
		});
		expect(run).toHaveBeenCalledTimes(1);
	});

	it.each([
		{
			name: "mysql2 tuple",
			provider: "mysql" as const,
			result: [{ affectedRows: 2 }, []],
		},
		{
			name: "node-postgres result",
			provider: "pg" as const,
			result: { rowCount: 2, rows: [] },
		},
		{
			name: "postgres-js result",
			provider: "pg" as const,
			result: Object.assign([], { count: 2 }),
		},
	])("normalizes $name for migration writes", async ({ provider, result }) => {
		const adapter = drizzleAdapter(
			{
				_: { fullSchema: {} },
				execute: vi.fn().mockResolvedValue(result),
			} as never,
			{ provider },
		)({ secret: "test-secret-that-is-at-least-32-chars-long!!" });

		await expect(
			adapter.options?.adapterConfig.migrationConnection?.execute({
				parameters: ["local:credential"],
				sql:
					provider === "pg"
						? "UPDATE account SET issuer = $1"
						: "UPDATE account SET issuer = ?",
			}),
		).resolves.toEqual({ numAffectedRows: 2n, rows: [] });
	});

	it.each([
		{
			provider: "sqlite" as const,
			sql: "SELECT '?' AS literal, providerId FROM account WHERE providerId = ? -- ?",
		},
		{
			provider: "pg" as const,
			sql: "SELECT '$2' AS literal, $$ $3 $$ AS body FROM account WHERE providerId = $1 -- $4",
		},
	])("ignores parameter-like text in $provider SQL literals and comments", async ({
		provider,
		sql: query,
	}) => {
		const rows = [{ providerId: "credential" }];
		const adapter = drizzleAdapter(
			{
				_: { fullSchema: {} },
				all: vi.fn().mockResolvedValue(rows),
				execute: vi.fn().mockResolvedValue(rows),
			} as never,
			{ provider },
		)({ secret: "test-secret-that-is-at-least-32-chars-long!!" });

		await expect(
			adapter.options?.adapterConfig.migrationConnection?.execute({
				parameters: ["credential"],
				sql: query,
			}),
		).resolves.toEqual({ rows });
	});

	it("scopes SQLite migration queries to one transaction", async () => {
		const statements: string[] = [];
		const run = vi.fn().mockImplementation((statement: SQL) => {
			statements.push(
				statement.queryChunks
					.flatMap((chunk) =>
						typeof chunk === "object" &&
						chunk !== null &&
						"value" in chunk &&
						Array.isArray(chunk.value)
							? chunk.value
							: [],
					)
					.join(""),
			);
			return { changes: 1 };
		});
		const adapter = drizzleAdapter(
			{
				_: { fullSchema: {} },
				all: vi.fn(),
				run,
			} as never,
			{ provider: "sqlite", transaction: true },
		)({ secret: "test-secret-that-is-at-least-32-chars-long!!" });
		const migrationConnection =
			adapter.options?.adapterConfig.migrationConnection;

		await migrationConnection?.transaction?.(async (connection) => {
			await connection.execute({
				parameters: [],
				sql: "UPDATE account SET issuer = 'local:credential'",
			});
		});

		expect(statements).toEqual([
			"SELECT 1",
			"BEGIN IMMEDIATE",
			"UPDATE account SET issuer = 'local:credential'",
			"COMMIT",
		]);
	});

	it("uses a transaction-scoped database for asynchronous SQLite migrations", async () => {
		const rootRun = vi.fn().mockResolvedValue({ changes: 0 });
		const transactionRun = vi.fn().mockResolvedValue({ changes: 1 });
		const transaction = vi.fn().mockImplementation(async (callback) =>
			callback({
				_: { fullSchema: {} },
				all: vi.fn(),
				run: transactionRun,
			}),
		);
		const adapter = drizzleAdapter(
			{
				_: { fullSchema: {} },
				all: vi.fn(),
				run: rootRun,
				transaction,
			} as never,
			{ provider: "sqlite", transaction: true },
		)({ secret: "test-secret-that-is-at-least-32-chars-long!!" });

		await adapter.options?.adapterConfig.migrationConnection?.transaction?.(
			async (connection) => {
				await connection.execute({
					parameters: [],
					sql: "UPDATE account SET issuer = 'local:credential'",
				});
			},
		);

		expect(transaction).toHaveBeenCalledOnce();
		expect(transactionRun).toHaveBeenCalledOnce();
		expect(rootRun).toHaveBeenCalledOnce();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10575#discussion_r3812054987
	 */
	it("does not expose migration transactions when the adapter disables them", () => {
		const adapter = drizzleAdapter(
			{
				_: { fullSchema: {} },
				all: vi.fn(),
				run: vi.fn(),
			} as never,
			{ provider: "sqlite", transaction: false },
		)({ secret: "test-secret-that-is-at-least-32-chars-long!!" });

		expect(
			adapter.options?.adapterConfig.migrationConnection?.transaction,
		).toBeUndefined();
	});

	it("should use unique column fallback for MySQL creates without an id", async () => {
		const userRow = {
			id: 42,
			name: "Test",
			email: "test@example.com",
			emailVerified: false,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const userTable = {
			id: { name: "id" },
			name: { name: "name" },
			email: { name: "email" },
			emailVerified: { name: "emailVerified" },
			image: { name: "image" },
			createdAt: { name: "createdAt" },
			updatedAt: { name: "updatedAt" },
		};

		const selectFromWhere = vi.fn().mockReturnValue({
			limit: vi.fn().mockReturnValue({
				execute: vi.fn().mockResolvedValue([userRow]),
			}),
		});
		const selectFrom = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: selectFromWhere,
			}),
		});

		const txProxy = new Proxy(
			{},
			{
				get(_target, prop) {
					if (prop === "select") return selectFrom;
					return undefined;
				},
			},
		);

		const db = {
			_: { fullSchema: { user: userTable } },
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					config: { values: [{ name: { value: "Test" } }] },
					execute: vi.fn().mockResolvedValue(undefined),
				}),
			}),
			transaction: vi.fn().mockImplementation((fn: any) => fn(txProxy)),
		} as any;
		const factory = drizzleAdapter(db, { provider: "mysql" });
		const adapter = factory({
			secret: "test-secret-that-is-at-least-32-chars-long!!",
			advanced: {
				database: {
					generateId: false,
				},
			},
		});

		const result = await adapter.create({
			model: "user",
			data: {
				name: "Test",
				email: "test@example.com",
			},
		});

		expect(result).toBeDefined();
		expect(db.transaction).toHaveBeenCalled();
	});

	describe("checkMissingFields", () => {
		function createMockDb(schema: Record<string, Record<string, any>>) {
			return {
				_: { fullSchema: schema },
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "1", name: "test" }]),
					}),
				}),
			} as any;
		}

		const defaultSecret = "test-secret-that-is-at-least-32-chars-long!!";

		it("should pass when drizzle schema has all required fields with default camelCase names", async () => {
			const userTable = {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				emailVerified: { name: "emailVerified" },
				image: { name: "image" },
				createdAt: { name: "createdAt" },
				updatedAt: { name: "updatedAt" },
			};
			const db = createMockDb({ user: userTable });
			const factory = drizzleAdapter(db, { provider: "sqlite" });
			const adapter = factory({ secret: defaultSecret });

			await expect(
				adapter.create({
					model: "user",
					data: {
						name: "Test",
						email: "test@example.com",
					},
				}),
			).resolves.toBeDefined();
		});

		it("should pass when drizzle schema uses snake_case and fieldName is customized to match", async () => {
			const userTable = {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				email_verified: { name: "email_verified" },
				image: { name: "image" },
				created_at: { name: "created_at" },
				updated_at: { name: "updated_at" },
			};
			const db = createMockDb({ user: userTable });
			const factory = drizzleAdapter(db, { provider: "sqlite" });
			const adapter = factory({
				secret: defaultSecret,
				user: {
					fields: {
						emailVerified: "email_verified",
						createdAt: "created_at",
						updatedAt: "updated_at",
					},
				},
			});

			await expect(
				adapter.create({
					model: "user",
					data: {
						name: "Test",
						email: "test@example.com",
					},
				}),
			).resolves.toBeDefined();
		});

		it("should throw a Drizzle-specific error when a field is missing from the drizzle schema", async () => {
			const userTable = {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				// missing emailVerified, image, createdAt, updatedAt
			};
			const db = createMockDb({ user: userTable });
			const factory = drizzleAdapter(db, { provider: "sqlite" });
			const adapter = factory({ secret: defaultSecret });

			await expect(
				adapter.create({
					model: "user",
					data: {
						name: "Test",
						email: "test@example.com",
					},
				}),
			).rejects.toThrow(
				/does not exist in the "user" Drizzle schema.*update your drizzle schema/,
			);
		});

		it("should throw when schema is not provided", async () => {
			const db = {
				_: {},
				insert: vi.fn(),
			} as any;
			const factory = drizzleAdapter(db, {
				provider: "sqlite",
				schema: undefined,
			});
			const adapter = factory({ secret: defaultSecret });

			await expect(
				adapter.create({
					model: "user",
					data: { name: "Test", email: "test@example.com" },
				}),
			).rejects.toThrow(/Schema not found/);
		});
	});

	describe("where field validation", () => {
		it("rejects a missing field in multiple AND conditions before querying", async () => {
			const account = pgTable("account", {
				accountId: text("account_id").notNull(),
			});
			const select = vi.fn();
			const adapter = drizzleAdapter(
				{ _: { fullSchema: { account } }, select },
				{ provider: "pg", schema: { account } },
			)({ secret: "test-secret-that-is-at-least-32-chars-long!!" });

			await expect(
				adapter.findOne({
					model: "account",
					where: [
						{ field: "issuer", value: "https://issuer.example" },
						{ field: "accountId", value: "subject" },
					],
				}),
			).rejects.toThrow(
				'The field "issuer" does not exist in the schema for the model "account"',
			);
			expect(select).not.toHaveBeenCalled();
		});

		it("rejects inherited field names before querying", async () => {
			const account = pgTable("account", {
				accountId: text("account_id").notNull(),
			});
			const select = vi.fn();
			const adapter = drizzleAdapter(
				{ _: { fullSchema: { account } }, select },
				{ provider: "pg", schema: { account } },
			)({
				secret: "test-secret-that-is-at-least-32-chars-long!!",
				account: { fields: { issuer: "constructor" } },
			});

			await expect(
				adapter.findOne({
					model: "account",
					where: [
						{ field: "issuer", value: "https://issuer.example" },
						{ field: "accountId", value: "subject" },
					],
				}),
			).rejects.toThrow(
				'The field "constructor" does not exist in the schema for the model "account"',
			);
			expect(select).not.toHaveBeenCalled();
		});
	});

	describe("updateMany affected-row count", () => {
		const defaultSecret = "test-secret-that-is-at-least-32-chars-long!!";
		const userTable = pgTable("user", {
			id: text("id"),
			name: text("name"),
			email: text("email"),
			emailVerified: boolean("emailVerified"),
			image: text("image"),
			createdAt: timestamp("createdAt"),
			updatedAt: timestamp("updatedAt"),
		});

		/**
		 * Builds a mock db whose `update().set().where()` chain resolves to the
		 * raw driver result a given dialect produces for an UPDATE.
		 */
		function createUpdateDb(driverResult: unknown) {
			return {
				_: { fullSchema: { user: userTable } },
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue(driverResult),
					}),
				}),
			} as any;
		}

		// updateMany must satisfy the DBAdapter contract: it returns the number
		// of affected rows, not the raw (dialect-specific) driver result.
		it.each([
			{ provider: "sqlite" as const, result: { changes: 2 }, expected: 2 },
			{ provider: "sqlite" as const, result: { changes: 0 }, expected: 0 },
			{ provider: "pg" as const, result: { rowCount: 2 }, expected: 2 },
			{ provider: "pg" as const, result: { rowCount: 0 }, expected: 0 },
			{
				provider: "mysql" as const,
				result: { rowsAffected: 2 },
				expected: 2,
			},
			{
				provider: "mysql" as const,
				result: [{ affectedRows: 2 }],
				expected: 2,
			},
			// postgres-js / bun-sql return an Array subclass carrying `count`;
			// a non-RETURNING write has length 0, so the count must be read off
			// the array itself, not from `result.length`.
			{
				provider: "pg" as const,
				result: Object.assign([], { count: 2 }),
				expected: 2,
			},
			// Cloudflare D1 nests the affected-row count under `meta.changes`.
			{
				provider: "sqlite" as const,
				result: { meta: { changes: 2 } },
				expected: 2,
			},
		])("returns the affected-row count for $provider ($expected)", async ({
			provider,
			result,
			expected,
		}) => {
			const db = createUpdateDb(result);
			const adapter = drizzleAdapter(db, { provider })({
				secret: defaultSecret,
			});

			const count = await adapter.updateMany({
				model: "user",
				where: [{ field: "emailVerified", value: false }],
				update: { emailVerified: true },
			});

			expect(count).toBe(expected);
		});

		it.each([
			{ provider: "sqlite" as const, result: { changes: Number.NaN } },
			{ provider: "pg" as const, result: { rowCount: "2" } },
			{ provider: "mysql" as const, result: [{ affectedRows: Infinity }] },
		])("throws for invalid affected-row counts from $provider", async ({
			provider,
			result,
		}) => {
			const db = createUpdateDb(result);
			const adapter = drizzleAdapter(db, { provider })({
				secret: defaultSecret,
			});

			await expect(
				adapter.updateMany({
					model: "user",
					where: [{ field: "emailVerified", value: false }],
					update: { emailVerified: true },
				}),
			).rejects.toThrow(
				"Drizzle adapter updateMany returned an invalid affected row count",
			);
		});
	});

	describe("consumeOne affected-row count", () => {
		const defaultSecret = "test-secret-that-is-at-least-32-chars-long!!";
		const verificationTable = pgTable("verification", {
			id: text("id"),
			identifier: text("identifier"),
			value: text("value"),
			expiresAt: timestamp("expiresAt"),
			createdAt: timestamp("createdAt"),
			updatedAt: timestamp("updatedAt"),
		});
		const verificationRow = {
			id: "verification-1",
			identifier: "reset-password:token",
			value: "user-1",
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		function createMysqlConsumeDb(driverResult: unknown) {
			const selectLimit = vi.fn().mockResolvedValue([verificationRow]);
			const selectFor = vi.fn().mockReturnValue({ limit: selectLimit });
			const selectWhere = vi.fn().mockReturnValue({ for: selectFor });
			const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
			const execute = vi.fn().mockResolvedValue(driverResult);
			const deleteWhere = vi.fn().mockReturnValue({ execute });
			const tx = {
				select: vi.fn().mockReturnValue({ from: selectFrom }),
				delete: vi.fn().mockReturnValue({ where: deleteWhere }),
			};
			const db = {
				_: { fullSchema: { verification: verificationTable } },
				transaction: vi
					.fn()
					.mockImplementation((fn: (transaction: typeof tx) => unknown) =>
						fn(tx),
					),
			} as Parameters<typeof drizzleAdapter>[0];
			return { db };
		}

		it("returns the consumed row for MySQL result-header arrays", async () => {
			const { db } = createMysqlConsumeDb([{ affectedRows: 1 }]);
			const adapter = drizzleAdapter(db, { provider: "mysql" })({
				secret: defaultSecret,
			});

			const result = await adapter.consumeOne({
				model: "verification",
				where: [{ field: "id", value: verificationRow.id }],
			});

			expect(result).toEqual(verificationRow);
			expect(db.transaction).toHaveBeenCalledOnce();
		});

		it("returns null when the MySQL delete does not affect a row", async () => {
			const { db } = createMysqlConsumeDb([{ affectedRows: 0 }]);
			const adapter = drizzleAdapter(db, { provider: "mysql" })({
				secret: defaultSecret,
			});

			const result = await adapter.consumeOne({
				model: "verification",
				where: [{ field: "id", value: verificationRow.id }],
			});

			expect(result).toBeNull();
		});
	});

	describe("incrementOne", () => {
		const defaultSecret = "test-secret-that-is-at-least-32-chars-long!!";
		const userTable = pgTable("user", {
			id: text("id"),
			name: text("name"),
			email: text("email"),
			emailVerified: boolean("emailVerified"),
			image: text("image"),
			attempts: integer("attempts"),
			createdAt: timestamp("createdAt"),
			updatedAt: timestamp("updatedAt"),
		});

		/**
		 * Builds a mock db that mirrors the adapter's single-row update: a
		 * `select().from().where().limit()` subquery picks one id, then
		 * `update().set().where().returning()` mutates by that id. Captures the
		 * `set` payload, the update's `where` args, and the select guard so a test
		 * can assert the `field = field + delta` expression and that the update is
		 * pinned to one selected id rather than the raw guard clause.
		 */
		function createIncrementDb(returned: unknown[]) {
			const calls: {
				set?: Record<string, unknown>;
				whereArgs?: unknown[];
				selectGuard?: unknown[];
			} = {};
			const returning = vi.fn().mockResolvedValue(returned);
			const updateWhere = vi.fn((...args: unknown[]) => {
				calls.whereArgs = args;
				return { returning };
			});
			const set = vi.fn((payload: Record<string, unknown>) => {
				calls.set = payload;
				return { where: updateWhere };
			});
			const targetIds = sql`select id from user`;
			const selectLimit = vi.fn().mockReturnValue(targetIds);
			const selectWhere = vi.fn((...args: unknown[]) => {
				calls.selectGuard = args;
				return { limit: selectLimit };
			});
			const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
			const db = {
				_: { fullSchema: { user: userTable } },
				select: vi.fn().mockReturnValue({ from: selectFrom }),
				update: vi.fn().mockReturnValue({ set }),
			} as any;
			return { db, calls, targetIds };
		}

		function createAdapter(db: any) {
			return drizzleAdapter(db, { provider: "sqlite" })({
				secret: defaultSecret,
				user: {
					additionalFields: {
						attempts: { type: "number", required: false },
					},
				},
			});
		}

		it("compiles each increment to a `column + delta` expression", async () => {
			const { db, calls } = createIncrementDb([{ id: "user-1", attempts: 4 }]);
			const adapter = createAdapter(db);

			const result = await adapter.incrementOne<{
				id: string;
				attempts: number;
			}>({
				model: "user",
				where: [{ field: "id", value: "user-1" }],
				increment: { attempts: 3 },
			});

			expect(result).toEqual({ id: "user-1", attempts: 4 });
			const expr = calls.set?.attempts;
			expect(is(expr, SQL)).toBe(true);
			const chunks = (expr as SQL).queryChunks;
			// The compiled expression embeds the target column, a " + " separator,
			// and a parameterized delta operand, proving the update is
			// `attempts + 3` without relying on raw primitive SQL chunks.
			expect(chunks).toContainEqual(userTable.attempts);
			expect(chunks).toContainEqual({ value: [" + "] });
			expect(
				chunks.some((chunk) => is(chunk, Param) && chunk.value === 3),
			).toBe(true);
			// The guard runs on the SELECT that picks one id (one predicate here);
			// the UPDATE is pinned to that single id, not the raw guard clause.
			expect(calls.selectGuard).toHaveLength(1);
			expect(calls.whereArgs).toHaveLength(1);
		});

		it("applies absolute `set` assignments alongside increments", async () => {
			const { db, calls } = createIncrementDb([
				{ id: "user-1", attempts: 1, name: "Renamed" },
			]);
			const adapter = createAdapter(db);

			await adapter.incrementOne({
				model: "user",
				where: [{ field: "id", value: "user-1" }],
				increment: { attempts: 1 },
				set: { name: "Renamed" },
			});

			expect(is(calls.set?.attempts, SQL)).toBe(true);
			// Absolute assignments are written verbatim, not wrapped in arithmetic.
			expect(calls.set?.name).toBe("Renamed");
		});

		it("mutates at most one row when the guard matches many", async () => {
			// A guard that holds for many rows (`attempts > 0`) must still touch a
			// single row. The adapter selects one id under `.limit(1)` and pins the
			// UPDATE to that id, so a non-unique guard cannot fan out.
			const { db, calls, targetIds } = createIncrementDb([
				{ id: "user-1", attempts: 5 },
			]);
			const adapter = createAdapter(db);

			const result = await adapter.incrementOne({
				model: "user",
				where: [{ field: "attempts", value: 0, operator: "gt" }],
				increment: { attempts: 1 },
			});

			expect(result).toEqual({ id: "user-1", attempts: 5 });

			// The non-unique guard is applied to the SELECT, which is capped to one
			// row; the UPDATE never receives the raw guard.
			expect(db.select).toHaveBeenCalledTimes(1);
			expect(calls.selectGuard).toHaveLength(1);

			// The UPDATE is guarded by a single `id IN (<one-row subquery>)`
			// predicate, not the original multi-row clause.
			expect(calls.whereArgs).toHaveLength(1);
			const updateGuard = calls.whereArgs?.[0];
			expect(is(updateGuard, SQL)).toBe(true);
			// The pinned predicate embeds the single-id subquery, proving the update
			// targets only the one selected row.
			expect((updateGuard as SQL).queryChunks).toContain(targetIds);
		});

		it("returns null when the guard matches no row", async () => {
			const { db } = createIncrementDb([]);
			const adapter = createAdapter(db);

			const result = await adapter.incrementOne({
				model: "user",
				// A `gt` guard that no row satisfies must yield null, never a row.
				where: [{ field: "attempts", value: 100, operator: "gt" }],
				increment: { attempts: -1 },
			});

			expect(result).toBeNull();
		});
	});
});
