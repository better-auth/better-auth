import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";
import { createLogger, logger } from "../env";
import type { BetterAuthOptions } from "../types";
import { EVICTION_TIMEOUT_MS } from "../utils/async";
import {
	createSchemaCheck,
	invalidateSchemaChecks,
	registerSchemaCheck,
	runtimeSchemaCheckFor,
	schemaCheckFor,
} from "./schema-check";
import type { SchemaFinding } from "./schema-diff";
import { SchemaMismatchError } from "./schema-diff";

const issuerDrift: SchemaFinding = {
	kind: "unexpected-required-column",
	table: "account",
	column: "issuer",
};

/**
 * @see https://www.better-auth.com/docs/concepts/database#programmatic-migrations
 */
describe("createSchemaCheck", () => {
	it("invalidates only checks for the migrated database", async () => {
		const database = {};
		const find = vi.fn(async () => []);
		const otherFind = vi.fn(async () => []);
		const check = createSchemaCheck(find, "database", database);
		const otherCheck = createSchemaCheck(otherFind, "database", {});
		await Promise.all([check(), otherCheck()]);
		invalidateSchemaChecks(database);
		await Promise.all([check(), otherCheck()]);
		expect(find).toHaveBeenCalledTimes(2);
		expect(otherFind).toHaveBeenCalledTimes(1);
	});

	it("does not let an old lookup overwrite a post-migration verdict", async () => {
		const database = {};
		let finish = (_findings: SchemaFinding[]) => {};
		const pending = new Promise<SchemaFinding[]>((resolve) => {
			finish = resolve;
		});
		const find = vi
			.fn<() => Promise<SchemaFinding[]>>()
			.mockReturnValueOnce(pending)
			.mockResolvedValueOnce([issuerDrift]);
		const check = createSchemaCheck(find, "database", database);
		const older = check();
		await Promise.resolve();
		invalidateSchemaChecks(database);
		await expect(check()).rejects.toThrow(SchemaMismatchError);
		finish([]);
		await expect(older).rejects.toThrow(SchemaMismatchError);
		await expect(check()).rejects.toThrow(SchemaMismatchError);
		expect(find).toHaveBeenCalledTimes(2);
	});
	it.each([
		{ findings: [] },
		{ findings: [issuerDrift] },
	])("rechecks a pending result after invalidation (%j)", async ({
		findings,
	}) => {
		const database = {};
		let finish = (_findings: SchemaFinding[]) => {};
		const pending = new Promise<SchemaFinding[]>((resolve) => {
			finish = resolve;
		});
		const find = vi
			.fn<() => Promise<SchemaFinding[]>>()
			.mockReturnValueOnce(pending)
			.mockResolvedValueOnce([]);
		const check = createSchemaCheck(find, "database", database);
		const older = check();
		await Promise.resolve();
		invalidateSchemaChecks(database);
		finish(findings);
		await expect(older).resolves.toBeUndefined();
		expect(find).toHaveBeenCalledTimes(2);
		expect(check()).toBeUndefined();
	});

	it("turns a synchronous lookup failure into a retryable rejection", async () => {
		const failure = new Error("connection unavailable");
		const find = vi
			.fn<() => Promise<SchemaFinding[]>>()
			.mockImplementationOnce(() => {
				throw failure;
			})
			.mockResolvedValueOnce([]);
		const check = createSchemaCheck(find, "database");

		await expect(check()).rejects.toBe(failure);
		await expect(check()).resolves.toBeUndefined();
		expect(find).toHaveBeenCalledTimes(2);
	});
	it("asks the store once and then answers without a promise", async () => {
		const find = vi.fn(async () => []);
		const check = createSchemaCheck(find, "database");
		await check();
		expect(check()).toBeUndefined();
		expect(find).toHaveBeenCalledTimes(1);
	});

	it("shares one lookup between concurrent first calls", async () => {
		const find = vi.fn(async () => []);
		const check = createSchemaCheck(find, "database");
		await Promise.all([check(), check(), check()]);
		expect(find).toHaveBeenCalledTimes(1);
	});

	it("keeps one mismatch and rethrows it without asking again", async () => {
		const find = vi.fn(async () => [issuerDrift]);
		const check = createSchemaCheck(find, "database");
		const first = await check()?.catch((error: unknown) => error);
		const second = await check()?.catch((error: unknown) => error);
		expect(first).toBeInstanceOf(SchemaMismatchError);
		expect(second).toBe(first);
		expect((first as SchemaMismatchError).findings).toEqual([issuerDrift]);
		expect(find).toHaveBeenCalledTimes(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10315
	 */
	describe("a lookup abandoned by the caller that started it", () => {
		const abandoned = () => new Promise<SchemaFinding[]>(() => {});

		beforeEach(() => {
			vi.useFakeTimers();
			vi.spyOn(logger, "warn").mockImplementation(() => {});
		});

		afterEach(() => {
			vi.useRealTimers();
			vi.restoreAllMocks();
		});

		it("releases a later caller at the bound", async () => {
			const find = vi.fn(abandoned);
			const check = createSchemaCheck(find, "database");

			void check();
			const later = check();
			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);

			await expect(later).resolves.toBeUndefined();
			expect(find).toHaveBeenCalledTimes(1);
		});

		it("warns once however many callers joined the same lookup", async () => {
			const check = createSchemaCheck(vi.fn(abandoned), "database");

			void check();
			void check();
			void check();
			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);

			expect(logger.warn).toHaveBeenCalledTimes(1);
		});

		it("warns through the logger its caller passes", async () => {
			const configured = createLogger({ disabled: true });
			vi.spyOn(configured, "warn");
			const check = createSchemaCheck(vi.fn(abandoned), "database");

			void check(configured);
			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);

			expect(configured.warn).toHaveBeenCalledTimes(1);
			expect(logger.warn).not.toHaveBeenCalled();
		});

		it("warns again when a later lookup is abandoned too", async () => {
			const find = vi.fn(abandoned);
			const check = createSchemaCheck(find, "database");

			void check();
			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);
			expect(logger.warn).toHaveBeenCalledTimes(1);

			void check();
			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);

			expect(logger.warn).toHaveBeenCalledTimes(2);
			expect(find).toHaveBeenCalledTimes(2);
		});

		it("asks the store again once the bound has passed", async () => {
			const find = vi
				.fn<() => Promise<SchemaFinding[]>>()
				.mockImplementationOnce(abandoned)
				.mockResolvedValueOnce([]);
			const check = createSchemaCheck(find, "database");

			void check();
			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);

			await expect(check()).resolves.toBeUndefined();
			expect(find).toHaveBeenCalledTimes(2);
		});

		it("keeps a mismatch past the bound without asking again", async () => {
			const find = vi.fn(async () => [issuerDrift]);
			const check = createSchemaCheck(find, "database");
			const first = await check()?.catch((error: unknown) => error);

			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);
			const later = await check()?.catch((error: unknown) => error);

			expect(later).toBe(first);
			expect(find).toHaveBeenCalledTimes(1);
			expect(logger.warn).not.toHaveBeenCalled();
		});

		it("keeps the replacement's mismatch when the abandoned lookup settles clean", async () => {
			let finish = (_findings: SchemaFinding[]) => {};
			const find = vi
				.fn<() => Promise<SchemaFinding[]>>()
				.mockReturnValueOnce(
					new Promise((resolve) => {
						finish = resolve;
					}),
				)
				.mockResolvedValueOnce([issuerDrift]);
			const check = createSchemaCheck(find, "database");

			void check();
			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);
			await expect(check()).rejects.toThrow(SchemaMismatchError);
			finish([]);
			await vi.advanceTimersByTimeAsync(0);

			await expect(check()).rejects.toThrow(SchemaMismatchError);
			expect(find).toHaveBeenCalledTimes(2);
		});
	});

	it("asks again after the store could not be reached", async () => {
		const find = vi
			.fn<() => Promise<SchemaFinding[]>>()
			.mockRejectedValueOnce(new Error("ECONNREFUSED"))
			.mockResolvedValueOnce([]);
		const check = createSchemaCheck(find, "database");
		await expect(check()).rejects.toThrow("ECONNREFUSED");
		await expect(check()).resolves.toBeUndefined();
		expect(find).toHaveBeenCalledTimes(2);
	});
});

describe("checksSchema", () => {
	it("accepts only a boolean validation option", () => {
		type DatabaseOptions = NonNullable<
			NonNullable<BetterAuthOptions["advanced"]>["database"]
		>;
		expectTypeOf<DatabaseOptions["validateSchema"]>().toEqualTypeOf<
			boolean | undefined
		>();
	});

	it.for([
		"development",
		"production",
		"test",
	])("checks in %s unless disabled", async (environment, {
		onTestFinished,
	}) => {
		onTestFinished(() => {
			vi.unstubAllEnvs();
			vi.resetModules();
		});
		vi.stubEnv("NODE_ENV", environment);
		vi.resetModules();
		const { checksSchema } = await import("./schema-check");
		expect(checksSchema({})).toBe(true);
		expect(
			checksSchema({ advanced: { database: { validateSchema: true } } }),
		).toBe(true);
		expect(
			checksSchema({ advanced: { database: { validateSchema: false } } }),
		).toBe(false);
	});
});

describe("schema check registry", () => {
	it("finds the check registered for an adapter and nothing for others", () => {
		const adapter = {};
		const check = createSchemaCheck(async () => [], "database");
		registerSchemaCheck(adapter, check);
		expect(schemaCheckFor(adapter)).toBe(check);
		expect(schemaCheckFor({})).toBeUndefined();
	});

	it("keeps an explicit check available when runtime validation is disabled", async () => {
		const adapter = {};
		const find = vi.fn(async () => []);
		const check = createSchemaCheck(find, "database");
		registerSchemaCheck(adapter, check, { runtimeEnabled: false });

		expect(runtimeSchemaCheckFor(adapter)).toBeUndefined();
		await schemaCheckFor(adapter)?.();
		expect(find).toHaveBeenCalledOnce();
	});
});
