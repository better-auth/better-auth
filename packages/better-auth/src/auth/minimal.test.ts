import { DatabaseSync } from "node:sqlite";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Auth } from "../types";
import { betterAuth } from "./minimal";

describe("auth-minimal", () => {
	const db: Record<string, any[]> = {};

	it("default auth type should be okay", () => {
		const auth = betterAuth({});
		type T = typeof auth;
		expectTypeOf<T>().toEqualTypeOf<Auth>();
	});

	it("should initialize with adapter without Kysely dependencies", async () => {
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(db),
		});

		expect(auth).toBeDefined();
		expect(auth.handler).toBeDefined();
		expect(auth.api).toBeDefined();
		expect(auth.options).toBeDefined();

		const ctx = await auth.$context;
		expect(ctx.adapter.id).toBe("memory");
	});

	it("should throw error when attempting to run migrations", async () => {
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(db),
		});

		const ctx = await auth.$context;
		await expect(ctx.runMigrations()).rejects.toThrow(
			"Migrations are not supported in 'better-auth/minimal'",
		);
	});

	it("should handle requests through adapter", async () => {
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(db),
		});

		const request = new Request("http://localhost:3000/api/auth/ok");
		const response = await auth.handler(request);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toMatchObject({ ok: true });
	});

	it("should throw error with direct database connection (Kysely required)", async () => {
		const sqliteDB = new DatabaseSync(":memory:");

		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: sqliteDB, // Direct database connection that requires Kysely
		});

		await expect(auth.$context).rejects.toThrow(
			"Direct database connection requires Kysely",
		);

		sqliteDB.close();
	});
});

describe("minimal additionalFields config typing", () => {
	it("should reject extraneous keys in user.additionalFields", () => {
		betterAuth({
			user: {
				additionalFields: {
					// @ts-expect-error - unknown key should not be allowed
					test: {
						type: "boolean",
						abc: "def",
					},
				},
			},
		});

		betterAuth({
			user: {
				additionalFields: {
					// @ts-expect-error - misspelled required should not be allowed
					test: {
						type: "boolean",
						require: true,
					},
				},
			},
		});
	});

	it("should reject extraneous keys when passed as a variable (structural strictness)", () => {
		const badConfig = {
			user: {
				additionalFields: {
					test: {
						type: "boolean" as const,
						abc: "def",
					},
				},
			},
		};

		// @ts-expect-error - extraneous keys should fail even when structurally typed
		betterAuth(badConfig);
	});

	it("should reject extraneous keys in session.additionalFields", () => {
		betterAuth({
			session: {
				additionalFields: {
					// @ts-expect-error - unknown key should not be allowed
					test: {
						type: "string",
						abc: "def",
					},
				},
			},
		});
	});

	it("should allow valid additionalFields keys and preserve inference", () => {
		const auth = betterAuth({
			user: {
				additionalFields: {
					role: {
						type: "string",
						required: true,
						input: true,
						returned: true,
					},
				},
			},
		});

		expectTypeOf<
			typeof auth.$Infer.Session.user.role
		>().toEqualTypeOf<string>();

		const authWithSessionField = betterAuth({
			session: {
				additionalFields: {
					deviceId: {
						type: "string",
						required: true,
						input: true,
						returned: true,
					},
				},
			},
		});

		expectTypeOf<
			typeof authWithSessionField.$Infer.Session.session.deviceId
		>().toEqualTypeOf<string>();
	});
});
