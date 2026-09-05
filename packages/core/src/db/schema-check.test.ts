import { describe, expect, it, vi } from "vitest";
import {
	checksSchema,
	createSchemaCheck,
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

describe("createSchemaCheck", () => {
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
	it("compares outside production unless the option decides", () => {
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
