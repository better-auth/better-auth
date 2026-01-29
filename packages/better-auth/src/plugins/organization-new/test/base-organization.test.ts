import type { RawError } from "@better-auth/core/utils/error-codes";
import { describe, expect, expectTypeOf } from "vitest";
import { teams } from "../addons";
import { organization } from "../organization";

describe("organization plugin", async (it) => {
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

	it("addons should be able to pass $Infer properties over", async () => {
		const org = organization({
			use: [teams()],
		});

		expectTypeOf<typeof org.$Infer.Team>().toEqualTypeOf<{
			id: string;
			name: string;
			organizationId: string;
			createdAt: Date;
			updatedAt?: Date | undefined;
		}>();
	});

	it("addons should be able to pass error codes over", async () => {
		const org = organization({
			use: [teams()],
		});

		expectTypeOf<typeof org.$ERROR_CODES.TEAM_NOT_FOUND>().toEqualTypeOf<
			RawError<"TEAM_NOT_FOUND">
		>();
	});

	it("addons should be able to pass a custom schema over", async () => {
		const teamsPlugin = teams();
		const org = organization({
			use: [teamsPlugin],
		});

		const schema = teamsPlugin.schema;

		expectTypeOf<typeof org.schema.team>().toEqualTypeOf<
			(typeof schema)["team"]
		>();

		expect(org.schema.team).toBeDefined();
		expect(org.schema.team).toStrictEqual(schema.team);
	});
});
