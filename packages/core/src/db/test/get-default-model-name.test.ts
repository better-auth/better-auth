import { describe, expect, it } from "vitest";
import { initGetDefaultModelName } from "../adapter/get-default-model-name";
import { getAuthTables } from "../get-tables";

describe("initGetDefaultModelName", () => {
	it("returns the schema key for a built-in model with no modelName override", () => {
		const getDefaultModelName = initGetDefaultModelName({
			schema: getAuthTables({}),
			usePlural: false,
		});

		expect(getDefaultModelName("user")).toBe("user");
		expect(getDefaultModelName("account")).toBe("account");
		expect(getDefaultModelName("session")).toBe("session");
	});

	it("resolves a custom modelName back to its schema key", () => {
		const getDefaultModelName = initGetDefaultModelName({
			schema: getAuthTables({
				user: { modelName: "users_table" },
			}),
			usePlural: false,
		});

		expect(getDefaultModelName("users_table")).toBe("user");
		expect(getDefaultModelName("user")).toBe("user");
	});

	it("handles usePlural by stripping the trailing s before lookup", () => {
		const getDefaultModelName = initGetDefaultModelName({
			schema: getAuthTables({}),
			usePlural: true,
		});

		expect(getDefaultModelName("users")).toBe("user");
		expect(getDefaultModelName("accounts")).toBe("account");
	});

	it("throws when the model cannot be resolved", () => {
		const getDefaultModelName = initGetDefaultModelName({
			schema: getAuthTables({}),
			usePlural: false,
		});

		expect(() => getDefaultModelName("does_not_exist")).toThrow(
			/Model "does_not_exist" not found in schema/,
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8111
	 *
	 * When a user remaps `user.modelName = "account"`, the string "account"
	 * collides with the built-in account schema key. Internal callers (and
	 * `references.model`, see get-tables.ts) always pass canonical schema
	 * keys, so an exact schema-key match must win: resolving "account" must
	 * return the OAuth account schema key, not the remapped user table.
	 */
	describe("user.modelName collision with account schema key", () => {
		const schema = getAuthTables({
			user: { modelName: "account" },
			account: { modelName: "identity" },
		});

		it("resolves a schema key to itself even when a modelName collides with it", () => {
			const getDefaultModelName = initGetDefaultModelName({
				schema,
				usePlural: false,
			});

			expect(getDefaultModelName("account")).toBe("account");
		});

		it("resolves the account's modelName alias to the account schema key", () => {
			const getDefaultModelName = initGetDefaultModelName({
				schema,
				usePlural: false,
			});

			expect(getDefaultModelName("identity")).toBe("account");
		});

		it("still resolves the original schema keys when no alias collides", () => {
			const getDefaultModelName = initGetDefaultModelName({
				schema,
				usePlural: false,
			});

			expect(getDefaultModelName("user")).toBe("user");
			expect(getDefaultModelName("session")).toBe("session");
			expect(getDefaultModelName("verification")).toBe("verification");
		});
	});
});
