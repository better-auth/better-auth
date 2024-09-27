import { describe, expect, it } from "vitest";
import { init } from "./init";

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
