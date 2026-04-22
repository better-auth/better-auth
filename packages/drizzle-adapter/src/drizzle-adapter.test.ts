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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9287
	 *
	 * Tests the raw adapter's withReturning behavior for MySQL when
	 * the inserted data has no `id` field (simulating generateId:false).
	 * We invoke the raw adapter directly (via the factory return, but with
	 * disableTransformInput/Output so the factory doesn't interfere).
	 */
	describe("MySQL withReturning safety for generateId:false", () => {
		const defaultSecret = "test-secret-that-is-at-least-32-chars-long!!";

		const sessionTable = {
			id: { name: "id" },
			token: { name: "token" },
			userId: { name: "userId" },
			expiresAt: { name: "expiresAt" },
			ipAddress: { name: "ipAddress" },
			userAgent: { name: "userAgent" },
			createdAt: { name: "createdAt" },
			updatedAt: { name: "updatedAt" },
		};

		function createMysqlMockDb(
			schema: Record<string, Record<string, any>>,
			tableRows: Record<string, any[]>,
			opts?: { $returningId?: (values: any) => any[] },
		) {
			const selectChain = () => {
				const chain: any = {};
				chain._whereId = undefined as string | undefined;
				chain.from = vi.fn().mockImplementation((schemaModel: any) => {
					const modelName = Object.keys(schema).find(
						(k) => schema[k] === schemaModel,
					);
					chain._modelName = modelName;
					return chain;
				});
				chain.where = vi.fn().mockImplementation((..._args: any[]) => {
					chain._hasWhere = true;
					const expr = _args[0];
					if (expr && typeof expr === "object" && "queryChunks" in expr) {
						const chunks = expr.queryChunks;
						if (Array.isArray(chunks)) {
							for (const chunk of chunks) {
								if (typeof chunk === "string" && chunk.length > 0) {
									chain._whereId = chunk;
									break;
								}
							}
						}
					}
					return chain;
				});
				chain.orderBy = vi.fn().mockImplementation((..._args: any[]) => {
					chain._ordered = true;
					return chain;
				});
				chain.limit = vi.fn().mockImplementation((_n: number) => {
					return chain;
				});
				chain.execute = vi.fn().mockImplementation(() => {
					const modelName = chain._modelName;
					if (modelName && tableRows[modelName]) {
						const rows = [...tableRows[modelName]];
						if (chain._hasWhere && chain._whereId) {
							const match = rows.find((r) => r.id === chain._whereId);
							return Promise.resolve(match ? [match] : []);
						}
						if (chain._ordered) {
							rows.sort((a, b) => {
								if (a.id > b.id) return -1;
								if (a.id < b.id) return 1;
								return 0;
							});
						}
						return Promise.resolve([rows[0]]);
					}
					return Promise.resolve([]);
				});
				chain.then = (resolve: (v: any) => void, reject: (e: any) => void) => {
					return chain.execute().then(resolve, reject);
				};
				return chain;
			};

			let lastInsertedValues: any = null;

			const insertChain: any = {};
			insertChain.values = vi.fn().mockImplementation((values: any) => {
				lastInsertedValues = values;
				insertChain.config = { values: [{}] };
				return insertChain;
			});
			insertChain.execute = vi.fn().mockResolvedValue(undefined);
			insertChain.returning = vi.fn();

			if (opts?.$returningId) {
				insertChain.$returningId = vi.fn().mockImplementation(() => {
					return Promise.resolve(opts.$returningId!(lastInsertedValues));
				});
			}

			return {
				_: { fullSchema: schema },
				select: vi.fn().mockImplementation(() => {
					return selectChain();
				}),
				insert: vi.fn().mockImplementation(() => {
					return insertChain;
				}),
			} as any;
		}

		it("should use $returningId() when available and return the correct row", async () => {
			const existingRows = [
				{
					id: "zzzz-existing-session",
					token: "token-for-user-x",
					userId: "user-x",
					expiresAt: new Date(),
					ipAddress: null,
					userAgent: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: "aaaa-new-session-for-user-a",
					token: "token-for-user-a",
					userId: "user-a",
					expiresAt: new Date(),
					ipAddress: null,
					userAgent: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const db = createMysqlMockDb(
				{ session: sessionTable },
				{ session: existingRows },
				{
					$returningId: () => [{ id: "aaaa-new-session-for-user-a" }],
				},
			);

			const factory = drizzleAdapter(db, { provider: "mysql" });
			const adapter = factory({
				secret: defaultSecret,
				advanced: { database: { generateId: false } },
			});

			const insertedSession = await adapter.create({
				model: "session",
				data: {
					token: "token-for-user-a",
					userId: "user-a",
					expiresAt: new Date(),
					ipAddress: null,
					userAgent: null,
				},
			});

			const insertCall = db.insert.mock.results[0].value;
			expect(insertCall.$returningId).toHaveBeenCalled();
			expect(insertedSession).not.toBeNull();
			expect(insertedSession.id).toBe("aaaa-new-session-for-user-a");
			expect(insertedSession.userId).toBe("user-a");
		});

		it("should throw a descriptive error when $returningId is not available and id is unknown", async () => {
			const existingRows = [
				{
					id: "zzzz-existing-session",
					token: "token-for-user-x",
					userId: "user-x",
					expiresAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const db = createMysqlMockDb(
				{ session: sessionTable },
				{ session: existingRows },
			);

			const factory = drizzleAdapter(db, { provider: "mysql" });
			const adapter = factory({
				secret: defaultSecret,
				advanced: { database: { generateId: false } },
			});

			await expect(
				adapter.create({
					model: "session",
					data: {
						token: "token-for-user-a",
						userId: "user-a",
						expiresAt: new Date(),
					},
				}),
			).rejects.toThrow(/Cannot safely retrieve the inserted row/);
		});

		it("should throw instead of silently returning the wrong row for a different user", async () => {
			const existingRows = [
				{
					id: "zzzz-old-session",
					token: "old-token",
					userId: "unrelated-user",
					expiresAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: "abcd-userB-session",
					token: "userB-token",
					userId: "user-b",
					expiresAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const db = createMysqlMockDb(
				{ session: sessionTable },
				{ session: existingRows },
			);

			const factory = drizzleAdapter(db, { provider: "mysql" });
			const adapter = factory({
				secret: defaultSecret,
				advanced: { database: { generateId: false } },
			});

			await expect(
				adapter.create({
					model: "session",
					data: {
						token: "userB-token",
						userId: "user-b",
						expiresAt: new Date(),
					},
				}),
			).rejects.toThrow(/generateId/);
		});

		it("should still work when factory generates IDs (default behavior)", async () => {
			const existingRows = [
				{
					id: "zzzz-existing-session",
					token: "token-for-user-x",
					userId: "user-x",
					expiresAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const db = createMysqlMockDb(
				{ session: sessionTable },
				{ session: existingRows },
			);

			const factory = drizzleAdapter(db, { provider: "mysql" });
			const adapter = factory({ secret: defaultSecret });

			const result = await adapter.create({
				model: "session",
				data: {
					token: "token-for-user-a",
					userId: "user-a",
					expiresAt: new Date(),
				},
			});

			expect(result).toBeDefined();
		});
	});
});
