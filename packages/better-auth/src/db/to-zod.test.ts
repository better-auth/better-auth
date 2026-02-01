import { describe, expect, it } from "vitest";
import { toZodSchema } from "./to-zod";

describe("toZodSchema", () => {
	describe("returned: false field handling (issue #7489)", () => {
		it("should include fields with returned: false in input schema", () => {
			const schema = toZodSchema({
				fields: {
					name: { type: "string", required: true },
					secretField: { type: "string", required: true, returned: false },
				},
			});

			expect(schema.shape).toHaveProperty("name");
			expect(schema.shape).toHaveProperty("secretField");
		});
	});
});
