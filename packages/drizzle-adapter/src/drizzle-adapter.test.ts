import { describe, expect, it } from "vitest";
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

	it("should not stringify json/array fields for sqlite inputs", async () => {
		let capturedValues: Record<string, unknown> | null = null;

		const db = {
			_: {
				fullSchema: {
					user: {
						id: true,
						name: true,
						email: true,
						emailVerified: true,
						image: true,
						createdAt: true,
						updatedAt: true,
						notificationTokens: true,
						profile: true,
					},
				},
			},
			insert: () => ({
				values: (values: Record<string, unknown>) => {
					capturedValues = values;
					return {
						returning: async () => [values],
					};
				},
			}),
		} as any;

		const adapter = drizzleAdapter(db, { provider: "sqlite" })({
			user: {
				additionalFields: {
					notificationTokens: {
						type: "string[]",
						required: true,
						input: true,
					},
					profile: {
						type: "json",
						required: true,
						input: true,
					},
				},
			},
		} as any);

		await adapter.create({
			model: "user",
			data: {
				name: "test",
				email: "test@example.com",
				notificationTokens: ["token1", "token2"],
				profile: { hello: "world" },
			},
		});

		const captured = capturedValues as any;
		expect(captured).toBeTruthy();
		expect(captured.notificationTokens).toEqual(["token1", "token2"]);
		expect(captured.profile).toEqual({ hello: "world" });
	});

	it("should parse legacy json-string values for sqlite outputs", async () => {
		const db = {
			_: {
				fullSchema: {
					user: {
						id: true,
						name: true,
						email: true,
						emailVerified: true,
						image: true,
						createdAt: true,
						updatedAt: true,
						notificationTokens: true,
						profile: true,
					},
				},
			},
			insert: () => ({
				values: () => ({
					returning: async () => [
						{
							id: "1",
							name: "test",
							email: "test@example.com",
							emailVerified: false,
							image: null,
							createdAt: new Date(),
							updatedAt: new Date(),
							notificationTokens: '["token1","token2"]',
							profile: '{"hello":"world"}',
						},
					],
				}),
			}),
		} as any;

		const adapter = drizzleAdapter(db, { provider: "sqlite" })({
			user: {
				additionalFields: {
					notificationTokens: {
						type: "string[]",
						required: true,
						input: true,
					},
					profile: {
						type: "json",
						required: true,
						input: true,
					},
				},
			},
		} as any);

		const created = await adapter.create({
			model: "user",
			data: {
				name: "test",
				email: "test@example.com",
				notificationTokens: ["token1", "token2"],
				profile: { hello: "world" },
			},
		});

		expect(created.notificationTokens).toEqual(["token1", "token2"]);
		expect(created.profile).toEqual({ hello: "world" });
	});

	it("should accept json-string inputs for sqlite array/json fields", async () => {
		let capturedValues: Record<string, unknown> | null = null;

		const db = {
			_: {
				fullSchema: {
					user: {
						id: true,
						name: true,
						email: true,
						emailVerified: true,
						image: true,
						createdAt: true,
						updatedAt: true,
						notificationTokens: true,
						profile: true,
					},
				},
			},
			insert: () => ({
				values: (values: Record<string, unknown>) => {
					capturedValues = values;
					return {
						returning: async () => [values],
					};
				},
			}),
		} as any;

		const adapter = drizzleAdapter(db, { provider: "sqlite" })({
			user: {
				additionalFields: {
					notificationTokens: {
						type: "string[]",
						required: true,
						input: true,
					},
					profile: {
						type: "json",
						required: true,
						input: true,
					},
				},
			},
		} as any);

		await adapter.create({
			model: "user",
			data: {
				name: "test",
				email: "test@example.com",
				notificationTokens: '["token1","token2"]',
				profile: '{"hello":"world"}',
			},
		});

		const captured = capturedValues as any;
		expect(captured).toBeTruthy();
		expect(captured.notificationTokens).toEqual(["token1", "token2"]);
		expect(captured.profile).toEqual({ hello: "world" });
	});
});
