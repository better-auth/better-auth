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

	it("should create drizzle adapter with mssql provider", () => {
		const db = {
			_: {
				fullSchema: {},
			},
		} as any;
		const config = {
			provider: "mssql" as const,
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

		it("should not call .returning() on mssql (uses execute + re-select)", async () => {
			const userTable = {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				emailVerified: { name: "emailVerified" },
				image: { name: "image" },
				createdAt: { name: "createdAt" },
				updatedAt: { name: "updatedAt" },
			};
			const insertedRow = {
				id: "abc",
				name: "Test",
				email: "test@example.com",
			};
			const returning = vi.fn();
			const execute = vi.fn().mockResolvedValue(undefined);
			// MSSQL select shape: db.select().top(1).from(table).where(...).execute()
			// — no .limit() in the chain. Asserting that .top() is called and
			// .limit() is not is what makes this test meaningful for MSSQL.
			const top = vi.fn();
			const limit = vi.fn();
			const finalExecute = vi.fn().mockResolvedValue([insertedRow]);
			const where = vi.fn().mockReturnValue({ execute: finalExecute, limit });
			const orderBy = vi.fn().mockReturnValue({ execute: finalExecute, limit });
			const from = vi.fn().mockReturnValue({ where, orderBy });
			top.mockReturnValue({ from });
			const select = vi.fn().mockReturnValue({ from, top });
			const db = {
				_: { fullSchema: { user: userTable } },
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						config: { values: [{ id: { value: "abc" } }] },
						execute,
						returning,
					}),
				}),
				select,
			} as any;
			const factory = drizzleAdapter(db, { provider: "mssql" });
			const adapter = factory({ secret: defaultSecret });

			await adapter.create({
				model: "user",
				data: { name: "Test", email: "test@example.com" },
			});

			expect(execute).toHaveBeenCalledTimes(1);
			expect(returning).not.toHaveBeenCalled();
			// MSSQL re-select must use TOP(1), not .limit(1) — the latter
			// throws at runtime because mssql-core doesn't expose .limit().
			expect(top).toHaveBeenCalledWith(1);
			expect(limit).not.toHaveBeenCalled();
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
});
