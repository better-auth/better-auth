import { describe, expect, it } from "vitest";
import { mergeSchema } from "./schema";

describe("mergeSchema", () => {
	/**
	 * Plugins pass module-level schema constants. Two auth instances with
	 * different table or field names in one process must not see each other's
	 * configuration.
	 */
	it("returns a copy instead of mutating the shared plugin schema", () => {
		const shared = {
			twoFactor: {
				modelName: "twoFactor",
				fields: {
					secret: { type: "string", required: true },
					userId: { type: "string", required: true },
				},
			},
		} as const;

		const merged = mergeSchema(shared, {
			twoFactor: { modelName: "custom_two_factor", fields: { secret: "s" } },
		});

		expect(merged.twoFactor.modelName).toBe("custom_two_factor");
		expect(merged.twoFactor.fields.secret).toMatchObject({ fieldName: "s" });
		expect(shared.twoFactor.modelName).toBe("twoFactor");
		expect(shared.twoFactor.fields.secret).not.toHaveProperty("fieldName");
		expect(merged.twoFactor.fields.userId).toBe(shared.twoFactor.fields.userId);
	});

	it("returns the input untouched when nothing overrides it", () => {
		const shared = { t: { modelName: "t", fields: {} } };
		expect(mergeSchema(shared)).toBe(shared);
	});
});
