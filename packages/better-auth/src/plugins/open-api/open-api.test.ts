import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { openAPI } from ".";

describe("open-api", async (it) => {
	const { auth } = await getTestInstance({
		plugins: [openAPI()],
	});

	it("should generate open api schema", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		expect(schema).toBeDefined();
	});
});
