import { describe, expect } from "vitest";
import { organization } from "../organization";

describe("organization", async (it) => {
	it("should throw an error when using slug as the default organization id field when slugs are disabled", async () => {
		try {
			organization({ defaultOrganizationIdField: "slug", disableSlugs: true });
			expect.fail("Should have thrown an error");
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe(
				"[Organization Plugin] Cannot use `slug` as the `defaultOrganizationIdField` when slugs are disabled",
			);
		}
	});
});
