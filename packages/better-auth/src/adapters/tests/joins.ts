import { expect } from "vitest";
import { createTestSuite } from "../create-test-suite";
import { getNormalTestSuiteTests } from "./basic";

export const joinsTestSuite = createTestSuite(
	"joins",
	{
		defaultBetterAuthOptions: {
			advanced: {
				database: {
					experimentalJoins: true,
				},
			},
		},
		alwaysMigrate: true,
		prefixTests: "joins",
	},
	(helpers) => {
		const { "create - should use generateId if provided": _, ...normalTests } =
			getNormalTestSuiteTests({ ...helpers });

		return {
			"init - tests": async () => {
				const opts = helpers.getBetterAuthOptions();
				expect(opts.advanced?.database?.experimentalJoins).toBe(true);
			},
			...normalTests,
		};
	},
);
