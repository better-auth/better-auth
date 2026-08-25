import { describe, expect, it } from "vitest";
import { initGetModelName } from "./get-model-name";

const schema = {
	user: { modelName: "user", fields: {} },
	jwks: { modelName: "jwks", fields: {} },
} as any;

describe("getModelName usePlural", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10930
	 */
	it("does not double-pluralize a model that already ends in s", () => {
		const getModelName = initGetModelName({ usePlural: true, schema });
		expect(getModelName("jwks")).toBe("jwks");
	});

	it("still pluralizes singular models", () => {
		const getModelName = initGetModelName({ usePlural: true, schema });
		expect(getModelName("user")).toBe("users");
	});

	it("leaves names alone when usePlural is off", () => {
		const getModelName = initGetModelName({ usePlural: false, schema });
		expect(getModelName("jwks")).toBe("jwks");
		expect(getModelName("user")).toBe("user");
	});
});
