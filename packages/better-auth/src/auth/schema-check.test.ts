import type { BetterAuthOptions } from "@better-auth/core";
import type { SchemaFinding } from "@better-auth/core/db/internal";
import {
	createSchemaCheck,
	registerSchemaCheck,
	SchemaMismatchError,
} from "@better-auth/core/db/internal";
import { createLogger } from "@better-auth/core/env";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { describe, expect, it, vi } from "vitest";
import { betterAuth } from "./full";
import { betterAuth as betterAuthMinimal } from "./minimal";

const issuerDrift: SchemaFinding[] = [
	{ kind: "unexpected-required-column", table: "account", column: "issuer" },
];

describe.each([
	["full", betterAuth],
	["minimal", betterAuthMinimal],
] as const)("%s initialization schema validation", (_name, initialize) => {
	function createAuth(
		find: () => Promise<SchemaFinding[]>,
		options: Partial<BetterAuthOptions> = {},
	) {
		const log = vi.fn();
		const database = (options: BetterAuthOptions) => {
			const adapter = memoryAdapter({})(options);
			registerSchemaCheck(adapter, createSchemaCheck(find, "database"));
			return adapter;
		};
		const auth = initialize({
			baseURL: "https://auth.example.com",
			secret: "schema-validation-test-secret-at-least-32-characters",
			database,
			logger: { log },
			...options,
		});
		return { auth, log };
	}

	it.for([
		{ validateSchema: true, disabled: false, level: "warn" },
		{ validateSchema: undefined, disabled: false, level: "debug" },
		{ validateSchema: false, disabled: false, level: undefined },
		{ validateSchema: true, disabled: true, level: undefined },
	] as const)("reports skipped validation: $validateSchema, logger disabled: $disabled", async ({
		validateSchema,
		disabled,
		level,
	}) => {
		const log = vi.fn();
		const auth = initialize({
			baseURL: "https://auth.example.com",
			secret: "schema-validation-test-secret-at-least-32-characters",
			database: (options) => ({ ...memoryAdapter({})(options), id: "custom" }),
			advanced: { database: { validateSchema } },
			logger: { log, level: "debug", disabled },
		});

		await auth.$context;
		if (level) {
			expect(log).toHaveBeenCalledExactlyOnceWith(
				level,
				'Schema validation is not available for adapter "custom". Skipping schema validation. Database operations will proceed normally.',
			);
		} else {
			expect(log).not.toHaveBeenCalled();
		}
		const initialLogCount = log.mock.calls.length;
		const response = await auth.handler(
			new Request("https://auth.example.com/api/auth/get-session"),
		);
		expect(response.status).toBe(200);
		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).resolves.toBeNull();
		expect(log).toHaveBeenCalledTimes(initialLogCount);
	});

	it("starts validation without adding a public readiness API", async () => {
		const find = vi.fn(async () => []);
		const log = vi.fn();
		const { auth } = createAuth(find, {
			advanced: { database: { validateSchema: true } },
			logger: { log, level: "debug" },
		});
		await auth.$context;

		expect(find).toHaveBeenCalledTimes(1);
		expect(auth).not.toHaveProperty("$ready");
		expect(log).not.toHaveBeenCalled();
	});

	it("shares the initialization verdict with concurrent requests", async () => {
		let finish = (_findings: SchemaFinding[]) => {};
		const pending = new Promise<SchemaFinding[]>((resolve) => {
			finish = resolve;
		});
		const find = vi.fn(() => pending);
		const { auth } = createAuth(find);
		await auth.$context;
		expect(find).toHaveBeenCalledTimes(1);

		const session = auth.api.getSession({ headers: new Headers() });
		const request = auth.handler(
			new Request("https://auth.example.com/api/auth/get-session"),
		);
		const outcomes = Promise.allSettled([session, request]);
		finish(issuerDrift);

		const results = await outcomes;
		expect(results).toEqual([
			{ status: "rejected", reason: expect.any(SchemaMismatchError) },
			{ status: "rejected", reason: expect.any(SchemaMismatchError) },
		]);
		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).rejects.toThrow(SchemaMismatchError);
		expect(find).toHaveBeenCalledTimes(1);
	});

	it("validates before a plugin can handle an HTTP request", async () => {
		const onRequest = vi.fn(async () => ({
			response: new Response("handled by plugin"),
		}));
		const { auth } = createAuth(async () => issuerDrift, {
			plugins: [{ id: "request-handler", onRequest }],
		});

		await expect(
			auth.handler(
				new Request("https://auth.example.com/api/auth/get-session"),
			),
		).rejects.toThrow(SchemaMismatchError);
		expect(onRequest).not.toHaveBeenCalled();
	});

	it("retries connectivity failures without logging driver secrets", async () => {
		const failure = new Error("postgres://user:secret@private-db/database");
		const find = vi
			.fn<() => Promise<SchemaFinding[]>>()
			.mockRejectedValueOnce(failure)
			.mockResolvedValueOnce([]);
		const { auth, log } = createAuth(find);

		await vi.waitFor(() => {
			expect(log).toHaveBeenCalledWith(
				"error",
				expect.stringContaining("Could not validate the database schema"),
			);
		});
		expect(JSON.stringify(log.mock.calls)).not.toContain(failure.message);
		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).resolves.toBeNull();
		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).resolves.toBeNull();
		expect(find).toHaveBeenCalledTimes(2);
	});

	it("leaves configuration accessible for migration tooling after a mismatch", async () => {
		const { auth, log } = createAuth(async () => issuerDrift);
		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).rejects.toThrow(SchemaMismatchError);

		const context = await auth.$context;
		expect(context.adapter.id).toBe("memory");
		expect(auth.options.database).toBeTypeOf("function");
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("1.7.0 through 1.7.2"),
		);
	});

	it("preserves context initialization failures", async () => {
		const find = vi.fn(async () => []);
		const { auth } = createAuth(find, { baseURL: { allowedHosts: [] } });

		await expect(auth.$context).rejects.toThrow(
			"baseURL.allowedHosts cannot be empty",
		);
		expect(find).not.toHaveBeenCalled();
	});

	it("does not report a plugin initialization failure as a schema error", async () => {
		const failure = new Error("plugin initialization failed");
		const find = vi.fn(async () => []);
		const { auth, log } = createAuth(find, {
			plugins: [
				{
					id: "failing-init",
					init: () => {
						throw failure;
					},
				},
			],
		});

		await expect(auth.$context).rejects.toBe(failure);
		await expect(auth.api.getSession({ headers: new Headers() })).rejects.toBe(
			failure,
		);
		expect(find).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalled();
	});

	it("reports schema failures through the initialized context logger", async () => {
		const contextLog = vi.fn();
		const { auth, log } = createAuth(async () => issuerDrift, {
			plugins: [
				{
					id: "context-logger",
					init: () => ({
						context: { logger: createLogger({ log: contextLog }) },
					}),
				},
			],
		});

		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).rejects.toThrow(SchemaMismatchError);
		await vi.waitFor(() => {
			expect(contextLog).toHaveBeenCalledWith(
				"error",
				new SchemaMismatchError(issuerDrift, "database").message,
			);
		});
		expect(log).not.toHaveBeenCalled();
	});

	it("checks the adapter selected during plugin initialization", async () => {
		const initialCheck = vi.fn(async () => []);
		const { auth } = createAuth(initialCheck, {
			plugins: [
				{
					id: "context-adapter",
					init: (context) => {
						const adapter = memoryAdapter({})(context.options);
						registerSchemaCheck(
							adapter,
							createSchemaCheck(async () => issuerDrift, "database"),
						);
						return { context: { adapter } };
					},
				},
			],
		});

		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).rejects.toThrow(SchemaMismatchError);
		expect(initialCheck).not.toHaveBeenCalled();
	});
});
