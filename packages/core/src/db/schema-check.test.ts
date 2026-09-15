import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { BetterAuthOptions } from "../types";
import {
	createSchemaCheck,
	invalidateSchemaChecks,
	registerSchemaCheck,
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
});
