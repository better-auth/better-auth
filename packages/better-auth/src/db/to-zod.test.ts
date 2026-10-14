import { describe, expect, expectTypeOf, it } from "vitest";
import type * as z from "zod";
import type { FieldAttributeToSchema } from "./to-zod";
import { toZodSchema } from "./to-zod";

describe("toZodSchema", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/7489
	 */
	describe("returned: false field handling (issue #7489)", () => {
		it("should include fields with returned: false in input schema (isClientSide: true)", () => {
			const schema = toZodSchema({
				fields: {
					name: { type: "string", required: true },
					secretField: { type: "string", required: true, returned: false },
				},
				isClientSide: true,
			});

			expect(schema.shape).toHaveProperty("name");
			expect(schema.shape).toHaveProperty("secretField");
			expectTypeOf<typeof schema.shape>().toHaveProperty("secretField");
		});

		it("should exclude fields with returned: false from output schema (isClientSide: false)", () => {
			const schema = toZodSchema({
				fields: {
					name: { type: "string", required: true },
					secretField: { type: "string", required: true, returned: false },
				},
				isClientSide: false,
			});

			expect(schema.shape).toHaveProperty("name");
			expect(schema.shape).not.toHaveProperty("secretField");
			expectTypeOf<typeof schema.shape>().not.toHaveProperty("secretField");
		});

		it("should account for either shape when the mode is a boolean", () => {
			const createSchema = (isClientSide: boolean) =>
				toZodSchema({
					fields: {
						name: { type: "string", required: true },
						secretField: { type: "string", returned: false },
					},
					isClientSide,
				});
			const schema = createSchema(false);

			expect(schema.shape).not.toHaveProperty("secretField");
			expect(createSchema(true).shape).toHaveProperty("secretField");
			expectTypeOf<typeof schema.shape>().toEqualTypeOf<
				| { name: z.ZodString; secretField: z.ZodString }
				| {
						name: z.ZodString;
				  }
			>();
		});
	});

	describe("scalar field types", () => {
		it("should map each scalar type to its zod schema", () => {
			const schema = toZodSchema({
				fields: {
					name: { type: "string" },
					age: { type: "number" },
					active: { type: "boolean" },
					createdAt: { type: "date" },
				},
				isClientSide: true,
			});

			const valid = { name: "a", age: 1, active: true, createdAt: new Date() };
			expect(schema.parse(valid)).toEqual(valid);
			expect(schema.safeParse({ ...valid, age: "1" }).success).toBe(false);
		});
	});

	/**
	 * @see https://zod.dev/api?id=json
	 */
	describe("json field type", () => {
		it("should accept JSON values and reject non-JSON values", () => {
			const schema = toZodSchema({
				fields: { metadata: { type: "json", required: true } },
				isClientSide: true,
			});

			expect(
				schema.safeParse({ metadata: { nested: ["value", 1, true, null] } })
					.success,
			).toBe(true);
			expect(schema.safeParse({ metadata: new Date() }).success).toBe(false);
		});
	});

	it("should preserve field attribute schema types", () => {
		expectTypeOf<
			FieldAttributeToSchema<{ type: "string" }>
		>().toEqualTypeOf<z.ZodString>();
		expectTypeOf<FieldAttributeToSchema<Record<string, never>>>().toEqualTypeOf<
			Record<string, never>
		>();
		expectTypeOf<
			FieldAttributeToSchema<{ type: "string"; input: false }, true>
		>().toEqualTypeOf<never>();
		expectTypeOf<
			FieldAttributeToSchema<
				{ type: "string"; input: false; returned: false },
				false
			>
		>().toEqualTypeOf<never>();
	});

	describe("required: false field nullability", () => {
		it("should accept null, undefined, and a value for an optional field", () => {
			const schema = toZodSchema({
				fields: {
					logo: { type: "string", required: false },
				},
				isClientSide: true,
			});

			expect(schema.parse({ logo: null })).toEqual({ logo: null });
			expect(schema.safeParse({ logo: undefined }).success).toBe(true);
			expect(schema.parse({})).toEqual({});
			expect(schema.parse({ logo: "value" })).toEqual({ logo: "value" });
		});

		it("should reject null for a required field", () => {
			const schema = toZodSchema({
				fields: {
					name: { type: "string", required: true },
				},
				isClientSide: true,
			});

			expect(schema.safeParse({ name: null }).success).toBe(false);
		});
	});
});
