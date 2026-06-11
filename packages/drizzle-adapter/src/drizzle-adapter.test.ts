import { is, SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { drizzleAdapter } from "./drizzle-adapter";

describe("drizzle-adapter", () => {
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

	describe("updateMany affected-row count", () => {
		const defaultSecret = "test-secret-that-is-at-least-32-chars-long!!";
		const userTable = {
			id: { name: "id" },
			name: { name: "name" },
			email: { name: "email" },
			emailVerified: { name: "emailVerified" },
			image: { name: "image" },
			createdAt: { name: "createdAt" },
			updatedAt: { name: "updatedAt" },
		};

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
	});

	describe("incrementOne", () => {
		const defaultSecret = "test-secret-that-is-at-least-32-chars-long!!";
		// `attempts` is a plain numeric column the increment targets; the rest
		// mirror the default user table so the factory's schema validation passes.
		const userTable = {
			id: { name: "id" },
			name: { name: "name" },
			email: { name: "email" },
			emailVerified: { name: "emailVerified" },
			image: { name: "image" },
			attempts: { name: "attempts" },
			createdAt: { name: "createdAt" },
			updatedAt: { name: "updatedAt" },
		};

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
			const targetIds = { __subquery: true };
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
			// and the raw delta operand, proving the update is `attempts + 3`.
			expect(chunks).toContainEqual(userTable.attempts);
			expect(chunks).toContainEqual({ value: [" + "] });
			expect(chunks).toContain(3);
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
