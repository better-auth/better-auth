import { describe, expect, it } from "vitest";
import { initGetModelName } from "../adapter/get-model-name";

describe("initGetModelName", () => {
	it("prefers explicit schema key before reverse modelName lookup", () => {
		const getModelName = initGetModelName({
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

		expect(getModelName("user")).toBe("account");
		expect(getModelName("account")).toBe("identity");
		expect(getModelName("identity")).toBe("identity");
	});
});
