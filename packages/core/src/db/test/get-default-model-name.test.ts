import { describe, expect, it } from "vitest";
import { initGetDefaultModelName } from "../adapter/get-default-model-name";

describe("initGetDefaultModelName", () => {
	it("prefers modelName match over schema key to avoid account collision", () => {
		const getDefaultModelName = initGetDefaultModelName({
			usePlural: false,
			schema: {
				user: {
					modelName: "account",
					fields: {},
				},
				account: {
					modelName: "identity",
					fields: {},
				},
			},
		});

		expect(getDefaultModelName("account")).toBe("user");
		expect(getDefaultModelName("identity")).toBe("account");
	});
});
