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

	describe("timestamp mode: string", () => {
		const defaultSecret = "test-secret-that-is-at-least-32-chars-long!!";

		/**
		 * @see https://github.com/better-auth/better-auth/issues/7419
		 */
		it("should convert Date objects to ISO strings for string-mode timestamp columns on create", async () => {
			let capturedValues: Record<string, any> | null = null;

			const userTable = {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				emailVerified: { name: "emailVerified" },
				image: { name: "image" },
				createdAt: { name: "createdAt", dataType: "string" },
				updatedAt: { name: "updatedAt", dataType: "string" },
			};

			const db = {
				_: { fullSchema: { user: userTable } },
				insert: vi.fn().mockImplementation(() => ({
					values: vi.fn().mockImplementation((vals: any) => {
						capturedValues = vals;
						return {
							returning: vi.fn().mockResolvedValue([
								{
									id: "1",
									name: "Test",
									email: "test@example.com",
									emailVerified: false,
									image: null,
									createdAt: new Date().toISOString(),
									updatedAt: new Date().toISOString(),
								},
							]),
						};
					}),
				})),
			} as any;

			const factory = drizzleAdapter(db, { provider: "pg" });
			const adapter = factory({ secret: defaultSecret });

			await adapter.create({
				model: "user",
				data: {
					name: "Test",
					email: "test@example.com",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			expect(capturedValues).not.toBeNull();
			expect(capturedValues!.createdAt).not.toBeInstanceOf(Date);
			expect(capturedValues!.updatedAt).not.toBeInstanceOf(Date);
			expect(typeof capturedValues!.createdAt).toBe("string");
			expect(typeof capturedValues!.updatedAt).toBe("string");
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/7419
		 */
		it("should convert Date objects to ISO strings for string-mode timestamp columns on update", async () => {
			let capturedSetValues: Record<string, any> | null = null;

			const userTable = {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				emailVerified: { name: "emailVerified" },
				image: { name: "image" },
				createdAt: { name: "createdAt", dataType: "string" },
				updatedAt: { name: "updatedAt", dataType: "string" },
			};

			const db = {
				_: { fullSchema: { user: userTable } },
				update: vi.fn().mockImplementation(() => ({
					set: vi.fn().mockImplementation((vals: any) => {
						capturedSetValues = vals;
						return {
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "1",
										name: "Test",
										email: "test@example.com",
										emailVerified: false,
										image: null,
										createdAt: new Date().toISOString(),
										updatedAt: new Date().toISOString(),
									},
								]),
							}),
						};
					}),
				})),
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "1",
								name: "Test",
								email: "test@example.com",
								emailVerified: false,
								image: null,
								createdAt: new Date().toISOString(),
								updatedAt: new Date().toISOString(),
							},
						]),
					}),
				}),
			} as any;

			const factory = drizzleAdapter(db, { provider: "pg" });
			const adapter = factory({ secret: defaultSecret });

			await adapter.update({
				model: "user",
				where: [{ field: "id", value: "1" }],
				update: {
					updatedAt: new Date(),
				},
			});

			expect(capturedSetValues).not.toBeNull();
			expect(capturedSetValues!.updatedAt).not.toBeInstanceOf(Date);
			expect(typeof capturedSetValues!.updatedAt).toBe("string");
		});

		it("should preserve Date objects for date-mode timestamp columns (e.g. SQLite integer timestamp_ms)", async () => {
			let capturedValues: Record<string, any> | null = null;

			const userTable = {
				id: { name: "id" },
				name: { name: "name" },
				email: { name: "email" },
				emailVerified: { name: "emailVerified" },
				image: { name: "image" },
				createdAt: { name: "createdAt", dataType: "date" },
				updatedAt: { name: "updatedAt", dataType: "date" },
			};

			const db = {
				_: { fullSchema: { user: userTable } },
				insert: vi.fn().mockImplementation(() => ({
					values: vi.fn().mockImplementation((vals: any) => {
						capturedValues = vals;
						return {
							returning: vi.fn().mockResolvedValue([
								{
									id: "1",
									name: "Test",
									email: "test@example.com",
									emailVerified: false,
									image: null,
									createdAt: new Date(),
									updatedAt: new Date(),
								},
							]),
						};
					}),
				})),
			} as any;

			const factory = drizzleAdapter(db, { provider: "sqlite" });
			const adapter = factory({ secret: defaultSecret });

			const now = new Date();
			await adapter.create({
				model: "user",
				data: {
					name: "Test",
					email: "test@example.com",
					createdAt: now,
					updatedAt: now,
				},
			});

			expect(capturedValues).not.toBeNull();
			expect(capturedValues!.createdAt).toBeInstanceOf(Date);
			expect(capturedValues!.updatedAt).toBeInstanceOf(Date);
		});
	});
});
