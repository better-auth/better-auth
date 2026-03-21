import { describe, expect, it } from "vitest";
import type { BetterAuthDBSchema } from "../type";
import { initGetModelName } from "./get-model-name";

function makeSchema(
	models: Record<string, { modelName: string }>,
): BetterAuthDBSchema {
	const schema: BetterAuthDBSchema = {};
	for (const [key, val] of Object.entries(models)) {
		schema[key] = {
			modelName: val.modelName,
			fields: {},
		};
	}
	return schema;
}

describe("initGetModelName", () => {
	describe("usePlural = false", () => {
		it("should return model name as-is", () => {
			const schema = makeSchema({
				user: { modelName: "user" },
				session: { modelName: "session" },
			});
			const getModelName = initGetModelName({ usePlural: false, schema });

			expect(getModelName("user")).toBe("user");
			expect(getModelName("session")).toBe("session");
		});

		it("should return custom model name as-is", () => {
			const schema = makeSchema({
				user: { modelName: "app_user" },
			});
			const getModelName = initGetModelName({ usePlural: false, schema });

			expect(getModelName("app_user")).toBe("app_user");
		});
	});

	describe("usePlural = true", () => {
		it("should pluralize standard model names", () => {
			const schema = makeSchema({
				user: { modelName: "user" },
				session: { modelName: "session" },
				account: { modelName: "account" },
				verification: { modelName: "verification" },
			});
			const getModelName = initGetModelName({ usePlural: true, schema });

			expect(getModelName("user")).toBe("users");
			expect(getModelName("session")).toBe("sessions");
			expect(getModelName("account")).toBe("accounts");
			expect(getModelName("verification")).toBe("verifications");
		});

		it("should not double-pluralize already plural model names", () => {
			const schema = makeSchema({
				user: { modelName: "user" },
				session: { modelName: "session" },
			});
			const getModelName = initGetModelName({ usePlural: true, schema });

			expect(getModelName("users")).toBe("users");
			expect(getModelName("sessions")).toBe("sessions");
		});

		it("should pluralize custom model names", () => {
			const schema = makeSchema({
				user: { modelName: "app_user" },
			});
			const getModelName = initGetModelName({ usePlural: true, schema });

			expect(getModelName("app_user")).toBe("app_users");
		});

		it("should not append 's' to uncountable model names", () => {
			const schema = makeSchema({
				staff: { modelName: "staff" },
			});
			const getModelName = initGetModelName({ usePlural: true, schema });

			// "staff" is uncountable → safePlural returns as-is
			expect(getModelName("staff")).toBe("staff");
		});

		it("should handle model names ending in 's' that are singular", () => {
			const schema = makeSchema({
				address: { modelName: "address" },
				status: { modelName: "status" },
			});
			const getModelName = initGetModelName({ usePlural: true, schema });

			// Same as legacy behavior (naive + "s")
			expect(getModelName("address")).toBe("addresss");
			expect(getModelName("status")).toBe("statuss");
		});
	});
});
