/**
 * @see https://github.com/better-auth/better-auth/issues/11538
 * @see https://github.com/better-auth/better-auth/issues/11725
 */
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { logger } from "@better-auth/core/env";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import {
	ensureResourceRow,
	getResource,
	invalidateResourceCache,
} from "./resources";
import type { OAuthOptions, Scope } from "./types";

const resource = "https://api.example.com/mcp";

const OAUTH_MODELS = new Set([
	"oauthResource",
	"oauthClient",
	"oauthClientResource",
	"oauthClientAssertion",
	"oauthConsent",
	"oauthAccessToken",
	"oauthRefreshToken",
]);

type Row = Record<string, unknown>;

const createDatabase = () => ({
	account: [] as Row[],
	jwks: [] as Row[],
	oauthAccessToken: [] as Row[],
	oauthClient: [] as Row[],
	oauthClientAssertion: [] as Row[],
	oauthClientResource: [] as Row[],
	oauthConsent: [] as Row[],
	oauthRefreshToken: [] as Row[],
	oauthResource: [] as Row[],
	session: [] as Row[],
	user: [] as Row[],
	verification: [] as Row[],
});

interface CallRecord {
	model: string;
	operation: string;
}

function createRecordingAdapter(
	beforeOAuthCall?: (call: CallRecord) => Promise<void> | void,
) {
	const database = createDatabase();
	const calls: CallRecord[] = [];
	const createAdapter = memoryAdapter(database);

	const databaseOption = (options: Parameters<typeof createAdapter>[0]) => {
		const adapter = createAdapter(options);
		return new Proxy(adapter, {
			get(target, property, receiver) {
				const value = Reflect.get(target, property, receiver);
				if (typeof value !== "function") return value;
				return async (...args: unknown[]) => {
					const model = (args[0] as { model?: string } | undefined)?.model;
					if (model && OAUTH_MODELS.has(model)) {
						const record: CallRecord = {
							model,
							operation: String(property),
						};
						calls.push(record);
						await beforeOAuthCall?.(record);
					}
					return (value as (...a: unknown[]) => unknown).apply(target, args);
				};
			},
		}) as DBAdapter;
	};

	return { database, calls, databaseOption };
}

function bootAuth(
	plugins: Parameters<typeof betterAuth>[0]["plugins"],
	beforeOAuthCall?: (call: CallRecord) => Promise<void> | void,
) {
	const recorder = createRecordingAdapter(beforeOAuthCall);
	const auth = betterAuth({
		appName: "11725-part2-test",
		baseURL: "http://localhost:3000",
		secret: "0123456789012345678901234567890123456789",
		database: (options) => recorder.databaseOption(options),
		plugins,
	});
	return { auth, database: recorder.database, calls: recorder.calls };
}

describe("resource startup and database-free init", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
		invalidateResourceCache();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("construction with resources records zero adapter operations on OAuth models", async () => {
		const { auth, database, calls } = bootAuth([
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [resource],
			}),
		]);
		await auth.$context;
		expect(calls).toEqual([]);
		expect(database.oauthResource).toHaveLength(0);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("construction with mcp({ resource }) records zero adapter operations on OAuth models", async () => {
		const mod = (await import(
			new URL("../../mcp/src/index.ts", import.meta.url).href
		)) as {
			mcp: (opts: {
				loginPage: string;
				consentPage: string;
				resource: string;
			}) => ReturnType<typeof oauthProvider>;
		};
		const { auth, database, calls } = bootAuth([
			jwt(),
			mod.mcp({
				loginPage: "/login",
				consentPage: "/consent",
				resource,
			}),
		]);
		await auth.$context;
		expect(calls).toEqual([]);
		expect(database.oauthResource).toHaveLength(0);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("a gated oauthResource read is never entered during construction", async () => {
		let enteredGate = false;
		const { auth } = bootAuth(
			[
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [resource],
				}),
			],
			async (call) => {
				if (call.model === "oauthResource" && call.operation === "findOne") {
					enteredGate = true;
				}
			},
		);

		await auth.$context;
		expect(enteredGate).toBe(false);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("warns once and skips invalid identifier at configuration indexing", async () => {
		const invalidUri = "not a valid uri";
		const { auth, database } = bootAuth([
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [invalidUri],
			}),
		]);
		const ctx = await auth.$context;
		const res = await getResource(
			{ context: ctx } as never,
			{
				loginPage: "/login",
				consentPage: "/consent",
				resources: [invalidUri],
			} as OAuthOptions<Scope[]>,
			invalidUri,
		);
		expect(res).toBeNull();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining(`skipping resource`),
		);
		expect(database.oauthResource).toHaveLength(0);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("strips unsupported signingAlgorithm with a warning log", async () => {
		const { auth } = bootAuth([
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [
					{
						identifier: resource,
						// @ts-expect-error testing invalid signingAlgorithm from raw config
						signingAlgorithm: "UNSUPPORTED_ALG",
					},
				],
			}),
		]);
		const ctx = await auth.$context;
		const res = await getResource(
			{ context: ctx } as never,
			{
				loginPage: "/login",
				consentPage: "/consent",
				resources: [
					{
						identifier: resource,
						signingAlgorithm: "UNSUPPORTED_ALG",
					},
				],
			} as unknown as OAuthOptions<Scope[]>,
			resource,
		);
		expect(res).not.toBeNull();
		expect(res?.signingAlgorithm).toBeNull();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining(`dropping unsupported signingAlgorithm`),
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("surfaces identifierValidator rejection on read, not at construction, and memoizes success", async () => {
		let validatorCallCount = 0;
		const rejected = "https://api.example.com/rejected";
		const opts: OAuthOptions<Scope[]> = {
			loginPage: "/login",
			consentPage: "/consent",
			resources: [resource, rejected],
			identifierValidator: (id) => {
				validatorCallCount++;
				if (id === rejected) {
					return false;
				}
				return true;
			},
		};

		const { auth } = bootAuth([jwt(), oauthProvider(opts)]);
		// Construction does zero validator calls
		await auth.$context;
		expect(validatorCallCount).toBe(0);

		const ctx = await auth.$context;
		// First read of rejected resource runs the validator, returns null, and logs a warning
		const rejectedRes = await getResource(
			{ context: ctx } as never,
			opts,
			rejected,
		);
		expect(rejectedRes).toBeNull();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining(`skipping resource for ${rejected}`),
		);
		expect(validatorCallCount).toBe(1);

		// Second read uses memoized invalid state and avoids re-invoking the validator
		const rejectedRes2 = await getResource(
			{ context: ctx } as never,
			opts,
			rejected,
		);
		expect(rejectedRes2).toBeNull();
		expect(validatorCallCount).toBe(1);

		// First read of valid resource runs the validator and succeeds
		const res = await getResource({ context: ctx } as never, opts, resource);
		expect(res?.identifier).toBe(resource);
		expect(validatorCallCount).toBe(2);

		// Second read of valid resource uses memoized check
		const res2 = await getResource({ context: ctx } as never, opts, resource);
		expect(res2?.identifier).toBe(resource);
		expect(validatorCallCount).toBe(2);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11034
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("ensureResourceRow returns the row inserted by a concurrent winner", async () => {
		const opts: OAuthOptions<Scope[]> = {
			loginPage: "/login",
			consentPage: "/consent",
			resources: [resource],
		};
		const { auth, database } = bootAuth([jwt(), oauthProvider(opts)]);
		const ctx = await auth.$context;

		let creates = 0;
		const originalCreate = ctx.adapter.create.bind(ctx.adapter);
		ctx.adapter.create = vi.fn(async (args) => {
			if (args.model === "oauthResource") {
				creates++;
				// Simulate another instance winning the insert
				database.oauthResource.push({
					id: resource,
					identifier: resource,
					name: "raced winner",
					disabled: false,
					createdAt: new Date(),
					updatedAt: new Date(),
					policyVersion: 1,
				});
				throw new Error("duplicate key value", {
					cause: Object.assign(new Error("duplicate key"), { code: "23505" }),
				});
			}
			return originalCreate(args);
		}) as never;

		const ensured = await ensureResourceRow(ctx as never, opts, resource);
		expect(ensured).toMatchObject({
			identifier: resource,
			name: "raced winner",
		});
		expect(creates).toBe(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("ensureResourceRow reports the insert error when the row cannot be re-read", async () => {
		const opts: OAuthOptions<Scope[]> = {
			loginPage: "/login",
			consentPage: "/consent",
			resources: [resource],
		};
		const { auth } = bootAuth([jwt(), oauthProvider(opts)]);
		const ctx = await auth.$context;

		ctx.adapter.create = vi.fn(async (args) => {
			if (args.model === "oauthResource") {
				throw new Error("value too long for column");
			}
			return null as never;
		}) as never;

		await expect(
			ensureResourceRow(ctx as never, opts, resource),
		).rejects.toThrow("value too long for column");
	});
});
