import { describe, expect, it } from "vitest";
import { schema } from "./schema";

describe("device authorization schema", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10025
	 */
	it("indexes device authorization lookup fields", () => {
		const deviceCodeSchema = schema as Record<
			string,
			{ fields: Record<string, { index?: boolean; unique?: boolean }> }
		>;

		for (const fieldName of ["deviceCode", "userCode"] as const) {
			const field = deviceCodeSchema.deviceCode?.fields[fieldName];

			expect(field?.index).toBe(true);
			expect(field?.unique).not.toBe(true);
		}
	});
});
