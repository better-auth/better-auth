import { describe, expect, it } from "vitest";
import type { BetterAuthOptions } from "../../types";
import type { BetterAuthDBSchema } from "../type";
import { initGetIdField } from "./get-id-field";

const minimalSchema: BetterAuthDBSchema = {
	user: {
		modelName: "user",
		fields: {
			name: { type: "string" },
			email: { type: "string" },
		},
	},
};

const uuidRegex =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getField(
	options: BetterAuthOptions,
	initExtra?: Partial<Parameters<typeof initGetIdField>[0]>,
	fieldExtra?: { customModelName?: string; forceAllowId?: boolean },
) {
	const idField = initGetIdField({
		schema: minimalSchema,
		options,
		...initExtra,
	});
	return idField({
		customModelName: fieldExtra?.customModelName ?? "user",
		forceAllowId: fieldExtra?.forceAllowId,
	});
}

describe("defaultValue priority", () => {
	it("should return undefined when disableIdGeneration is true", () => {
		const field = getField(
			{ database: {} as any },
			{ disableIdGeneration: true },
		);
		expect(field.defaultValue).toBeUndefined();
	});

	it("should return undefined when generateId is false", () => {
		const value = getField({
			database: {} as any,
			advanced: { database: { generateId: false } },
		}).defaultValue?.();
		expect(value).toBeUndefined();
	});

	it("should return undefined when generateId is 'serial'", () => {
		const value = getField({
			database: {} as any,
			advanced: { database: { generateId: "serial" } },
		}).defaultValue?.();
		expect(value).toBeUndefined();
	});

	it("should use generateId function over 'uuid' and customIdGenerator", () => {
		const value = getField(
			{
				database: {} as any,
				advanced: { database: { generateId: () => "fn-id" } },
			},
			{ customIdGenerator: () => "adapter-id" },
		).defaultValue?.();
		expect(value).toBe("fn-id");
	});

	it("should use 'uuid' over customIdGenerator", () => {
		const value = getField(
			{
				database: {} as any,
				advanced: { database: { generateId: "uuid" } },
			},
			{ customIdGenerator: () => "adapter-id", supportsUUIDs: false },
		).defaultValue?.();
		expect(value).toMatch(uuidRegex);
	});

	it("should use customIdGenerator when generateId is not set", () => {
		const value = getField(
			{ database: {} as any },
			{ customIdGenerator: () => "adapter-id" },
		).defaultValue?.();
		expect(value).toBe("adapter-id");
	});

	it("should fall back to default id generation", () => {
		const value = getField({ database: {} as any }).defaultValue?.();
		expect(typeof value).toBe("string");
		expect(value).not.toMatch(uuidRegex);
	});
});

describe("type and required", () => {
	it("should have type 'number' when generateId is 'serial'", () => {
		const field = getField({
			database: {} as any,
			advanced: { database: { generateId: "serial" } },
		});
		expect(field.type).toBe("number");
		expect(field.required).toBe(false);
	});

	it("should have type 'string' by default", () => {
		const field = getField({ database: {} as any });
		expect(field.type).toBe("string");
		expect(field.required).toBe(true);
	});

	it("should not generate id when useUUIDs and supportsUUIDs", () => {
		const field = getField(
			{
				database: {} as any,
				advanced: { database: { generateId: "uuid" } },
			},
			{ supportsUUIDs: true },
		);
		expect(field.required).toBe(false);
		expect(field.defaultValue).toBeUndefined();
	});
});

describe("transform.input", () => {
	it("should return undefined for falsy value", () => {
		const field = getField({ database: {} as any });
		expect(field.transform.input(undefined)).toBeUndefined();
		expect(field.transform.input(null)).toBeUndefined();
		expect(field.transform.input("")).toBeUndefined();
	});

	it("should return value as-is by default", () => {
		const field = getField({ database: {} as any });
		expect(field.transform.input("some-id")).toBe("some-id");
	});

	describe("serial", () => {
		it("should convert string to number", () => {
			const field = getField({
				database: {} as any,
				advanced: { database: { generateId: "serial" } },
			});
			expect(field.transform.input("42")).toBe(42);
		});

		it("should return undefined for non-numeric string", () => {
			const field = getField({
				database: {} as any,
				advanced: { database: { generateId: "serial" } },
			});
			expect(field.transform.input("not-a-number")).toBeUndefined();
		});
	});

	describe("uuid", () => {
		it("should return value as-is when shouldGenerateId and not forceAllowId", () => {
			const field = getField(
				{
					database: {} as any,
					advanced: { database: { generateId: "uuid" } },
				},
				{ supportsUUIDs: false },
			);
			const uuid = crypto.randomUUID();
			expect(field.transform.input(uuid)).toBe(uuid);
		});

		it("should return undefined when supportsUUIDs (DB handles it)", () => {
			const field = getField(
				{
					database: {} as any,
					advanced: { database: { generateId: "uuid" } },
				},
				{ supportsUUIDs: true },
			);
			expect(field.transform.input("some-value")).toBeUndefined();
		});

		it("should accept valid UUID when forceAllowId is true", () => {
			const uuid = crypto.randomUUID();
			const field = getField(
				{
					database: {} as any,
					advanced: { database: { generateId: "uuid" } },
				},
				{ supportsUUIDs: false },
				{ forceAllowId: true },
			);
			expect(field.transform.input(uuid)).toBe(uuid);
		});

		it("should generate new UUID for non-string value when DB doesn't support UUIDs", () => {
			const field = getField(
				{
					database: {} as any,
					advanced: { database: { generateId: "uuid" } },
				},
				{ supportsUUIDs: false },
				{ forceAllowId: true },
			);
			const result = field.transform.input(123);
			expect(result).toMatch(uuidRegex);
		});
	});
});

describe("transform.output", () => {
	it("should return undefined for falsy value", () => {
		const field = getField({ database: {} as any });
		expect(field.transform.output(undefined)).toBeUndefined();
		expect(field.transform.output(null)).toBeUndefined();
		expect(field.transform.output("")).toBeUndefined();
	});

	it("should convert value to string", () => {
		const field = getField({ database: {} as any });
		expect(field.transform.output(123)).toBe("123");
		expect(field.transform.output("abc")).toBe("abc");
	});
});
