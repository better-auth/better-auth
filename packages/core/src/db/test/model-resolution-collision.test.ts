import { describe, expect, it } from "vitest";
import { initGetDefaultFieldName } from "../adapter/get-default-field-name";
import { initGetDefaultModelName } from "../adapter/get-default-model-name";
import { initGetFieldAttributes } from "../adapter/get-field-attributes";
import { initGetFieldName } from "../adapter/get-field-name";
import { getAuthTables } from "../get-tables";

describe("adapter model/field resolution with colliding model names", () => {
	const schema = getAuthTables({
		user: {
			modelName: "account",
		},
		account: {
			modelName: "identity",
			fields: {
				userId: "account_id",
				accountId: "account_id",
			},
		},
	});

	it("prefers exact schema key over modelName alias", () => {
		const getDefaultModelName = initGetDefaultModelName({
			schema,
			usePlural: false,
		});

		expect(getDefaultModelName("account")).toBe("account");
		expect(getDefaultModelName("identity")).toBe("account");
		expect(getDefaultModelName("user")).toBe("user");
	});

	it("resolves user fields correctly when user modelName collides with account", () => {
		const getDefaultFieldName = initGetDefaultFieldName({
			schema,
			usePlural: false,
		});
		const getFieldName = initGetFieldName({
			schema,
			usePlural: false,
		});
		const getFieldAttributes = initGetFieldAttributes({
			schema,
			usePlural: false,
			options: {} as any,
		});

		expect(
			getDefaultFieldName({
				model: "account",
				field: "email",
			}),
		).toBe("email");
		expect(
			getFieldName({
				model: "account",
				field: "email",
			}),
		).toBe("email");
		expect(
			getFieldAttributes({
				model: "account",
				field: "email",
			}).type,
		).toBe("string");
	});

	it("still resolves oauth account fields from account schema key", () => {
		const getDefaultFieldName = initGetDefaultFieldName({
			schema,
			usePlural: false,
		});
		const getFieldName = initGetFieldName({
			schema,
			usePlural: false,
		});

		expect(
			getDefaultFieldName({
				model: "account",
				field: "accountId",
			}),
		).toBe("accountId");
		expect(
			getFieldName({
				model: "account",
				field: "accountId",
			}),
		).toBe("account_id");
	});
});
