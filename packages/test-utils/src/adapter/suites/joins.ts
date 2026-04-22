import { expect } from "vitest";
import { createTestSuite } from "../create-test-suite.js";
import { getNormalTestSuiteTests } from "./basic.js";

export const joinsTestSuite = createTestSuite(
	"joins",
	{
		defaultBetterAuthOptions: {
			experimental: {
				joins: true,
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
				expect(opts.experimental?.joins).toBe(true);
			},
			...normalTests,
		};
	},
);
