import { createTestSuite } from "../create-test-suite";
import { getNormalTestSuiteTests } from "../tests";

export const mongoStringIdTestSuite = createTestSuite(
	"mongo-string-id",
	{},
	(helpers) => {
		const tests = getNormalTestSuiteTests(helpers);
		return {
			...tests,
		};
	},
);
