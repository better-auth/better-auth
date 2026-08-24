import { describe, expect, it } from "vitest";
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
		});
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
