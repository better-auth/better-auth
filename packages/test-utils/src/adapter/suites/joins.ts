import { createTestSuite } from "../create-test-suite";
import { getNormalTestSuiteTests } from "./basic";

export const joinsTestSuite = createTestSuite(
	"joins",
	{
		alwaysMigrate: true,
		prefixTests: "joins",
	},
	(helpers) => {
		const { "create - should use generateId if provided": _, ...normalTests } =
			getNormalTestSuiteTests({ ...helpers });

		return {
			...normalTests,
		};
	},
);
