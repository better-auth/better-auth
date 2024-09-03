import { describe, expect, it } from "vitest";
import { init } from "./init";
import { getTestInstance } from "./test-utils/test-instance";

describe("init", async () => {
	it("should match config", () => {
		const res = init({
			database: {
				provider: "sqlite",
				url: ":memory:",
			},
		});
		expect(res).toMatchSnapshot();
	});
});
