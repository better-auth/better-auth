import { describe, expect, it } from "vitest";
import { schema } from "./schema";

describe("device authorization schema", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10025
	 */
	it("indexes device authorization lookup fields", () => {
		expect(schema.deviceCode.indexes).toEqual([
			{ fields: ["deviceCode"] },
			{ fields: ["userCode"] },
		]);
	});
});
