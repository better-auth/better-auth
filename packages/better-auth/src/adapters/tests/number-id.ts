import { expect } from "vitest";
import { createTestSuite } from "../create-test-suite";
import type { User } from "better-auth/types";
import { getNormalTestSuiteTests } from "./normal";

export const numberIdTestSuite = createTestSuite(
	"number-id",
	{
		defaultBetterAuthOptions: {
			advanced: {
				database: {
					useNumberId: true,
				},
			},
		},
		alwaysMigrate: true,
		prefixTests: "number-id",
	},
	(helpers) => {
		const { "create - should use generateId if provided": _, ...normalTests } =
			getNormalTestSuiteTests({ ...helpers });

		return {
			"init - tests": async () => {
				const opts = helpers.getBetterAuthOptions();
				expect(opts.advanced?.database?.useNumberId).toBe(true);
			},
			"create - should return a number id": async () => {
				const user = await helpers.generate("user");
				const res = await helpers.adapter.create<User>({
					model: "user",
					data: user,
					forceAllowId: true,
				});
				expect(res).toHaveProperty("id");
				expect(typeof res.id).toBe("string");
				expect(parseInt(res.id)).toBeGreaterThan(0);
			},
			...normalTests,
		};
	},
);
