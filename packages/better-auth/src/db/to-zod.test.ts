import { describe, expect, it } from "vitest";
import { toZodSchema } from "./to-zod";

describe("toZodSchema", () => {
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
});
