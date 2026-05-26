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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8655
	 */
	describe("supportsJSON / supportsArrays override", () => {
		const defaultSecret = "test-secret-that-is-at-least-32-chars-long!!";

		function createCaptureDb(schema: Record<string, Record<string, any>>) {
			const captured: { values?: unknown } = {};
			const db = {
				_: { fullSchema: schema },
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockImplementation((value: unknown) => {
						captured.values = value;
						return {
							returning: vi.fn().mockResolvedValue([{ id: "1" }]),
						};
					}),
				}),
			} as any;
			return { db, captured };
		}

		const userTable = {
			id: { name: "id" },
			name: { name: "name" },
			email: { name: "email" },
			emailVerified: { name: "emailVerified" },
			image: { name: "image" },
			createdAt: { name: "createdAt" },
			updatedAt: { name: "updatedAt" },
			tags: { name: "tags" },
		};

		const userWithArrayField = {
			user: {
				additionalFields: {
					tags: { type: "string[]" as const, required: false },
				},
			},
		};

		it("stringifies array fields on sqlite by default", async () => {
			const { db, captured } = createCaptureDb({ user: userTable });
			const factory = drizzleAdapter(db, { provider: "sqlite" });
			const adapter = factory({ secret: defaultSecret, ...userWithArrayField });

			await adapter.create({
				model: "user",
				data: {
					name: "Test",
					email: "test@example.com",
					tags: ["a", "b"],
				},
			});

			expect(typeof (captured.values as any)?.tags).toBe("string");
			expect((captured.values as any)?.tags).toBe(JSON.stringify(["a", "b"]));
		});

		it("passes array fields through when supportsArrays override is true", async () => {
			const { db, captured } = createCaptureDb({ user: userTable });
			const factory = drizzleAdapter(db, {
				provider: "sqlite",
				supportsArrays: true,
			});
			const adapter = factory({ secret: defaultSecret, ...userWithArrayField });

			await adapter.create({
				model: "user",
				data: {
					name: "Test",
					email: "test@example.com",
					tags: ["a", "b"],
				},
			});

			// With the override, Drizzle's own `mode: "json"` column handling
			// stringifies the value on insert — the adapter must not double-encode.
			expect(Array.isArray((captured.values as any)?.tags)).toBe(true);
			expect((captured.values as any)?.tags).toEqual(["a", "b"]);
		});

		it("keeps default Postgres behavior when override is not provided", async () => {
			const { db, captured } = createCaptureDb({ user: userTable });
			const factory = drizzleAdapter(db, { provider: "pg" });
			const adapter = factory({ secret: defaultSecret, ...userWithArrayField });

			await adapter.create({
				model: "user",
				data: {
					name: "Test",
					email: "test@example.com",
					tags: ["a", "b"],
				},
			});

			// Postgres has native arrays — the adapter must not stringify.
			expect(Array.isArray((captured.values as any)?.tags)).toBe(true);
		});
	});
});
