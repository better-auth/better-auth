import { describe, expect, it } from "vitest";
import { initGetFieldName } from "../adapter/get-field-name";

describe("initGetFieldName", () => {
	it("resolves fields using explicit schema key for ambiguous model names", () => {
		const getFieldName = initGetFieldName({
			usePlural: false,
			schema: {
				user: {
					modelName: "account",
					fields: {
						email: { type: "string", fieldName: "email" },
					},
				},
				account: {
					modelName: "identity",
					fields: {
						userId: { type: "string", fieldName: "account_id" },
					},
				},
			},
		});

		expect(getFieldName({ model: "user", field: "email" })).toBe("email");
		expect(getFieldName({ model: "account", field: "userId" })).toBe(
			"account_id",
		);
	});
});
