import { getAuthTables } from "@better-auth/core/db";
import { describe, expect, it } from "vitest";
import { twoFactor } from "../plugins/two-factor";
import { mergeSchema } from "./schema";

/**
 * @see https://github.com/better-auth/better-auth/issues/12122
 */
describe("mergeSchema", () => {
	const modelName = (options: Parameters<typeof getAuthTables>[0]) =>
		getAuthTables(options).twoFactor!.modelName;

	it("does not leak plugin schema overrides across plugin instances", () => {
		const member = {
			plugins: [
				twoFactor({ schema: { twoFactor: { modelName: "MemberTwoFactor" } } }),
			],
		};
		const admin = {
			plugins: [
				twoFactor({ schema: { twoFactor: { modelName: "AdminTwoFactor" } } }),
			],
		};

		expect(modelName(member)).toBe("MemberTwoFactor");
		expect(modelName(admin)).toBe("AdminTwoFactor");
		expect(modelName({ plugins: [twoFactor()] })).toBe("twoFactor");
	});

	it("does not leak field renames across plugin instances", () => {
		const fieldName = (options: Parameters<typeof getAuthTables>[0]) =>
			getAuthTables(options).twoFactor!.fields.secret!.fieldName;

		const renamed = {
			plugins: [
				twoFactor({
					schema: { twoFactor: { fields: { secret: "totp_secret" } } },
				}),
			],
		};
		expect(fieldName(renamed)).toBe("totp_secret");
		expect(fieldName({ plugins: [twoFactor()] })).not.toBe("totp_secret");
	});

	it("does not mutate the schema it receives", () => {
		const defaultValue = () => "generated";
		const schema = {
			item: {
				modelName: "item",
				fields: {
					name: { type: "string" as const, fieldName: "name", defaultValue },
				},
			},
		};

		const merged = mergeSchema(schema, {
			item: { modelName: "renamed", fields: { name: "label" } },
		});

		expect(merged.item.modelName).toBe("renamed");
		expect(merged.item.fields.name.fieldName).toBe("label");
		expect(merged.item.fields.name.defaultValue).toBe(defaultValue);
		expect(schema.item.modelName).toBe("item");
		expect(schema.item.fields.name.fieldName).toBe("name");
	});
});
