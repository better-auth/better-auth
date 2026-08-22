import { describe, expect, it } from "vitest";
import { initGetModelName } from "./get-model-name";

// Real schemas carry an explicit modelName on every model (filled in by
// options parsing); mirror that here.
const schema = {
	user: {
		fields: { id: { type: "string" } },
		modelName: "user",
	},
	jwks: {
		fields: { id: { type: "string" } },
		modelName: "jwks",
	},
	withAlias: {
		fields: { id: { type: "string" } },
		modelName: "custom_table",
	},
	withAliasEndingInS: {
		fields: { id: { type: "string" } },
		modelName: "custom_tables",
	},
} as unknown as Parameters<typeof initGetModelName>[0]["schema"];

describe("getModelName", () => {
	it("appends s when usePlural is set", () => {
		const getModelName = initGetModelName({ usePlural: true, schema });
		expect(getModelName("user")).toBe("users");
	});

	it("does not double-pluralize a model already ending in s", () => {
		// Regression (#10930): `jwks` became `jwkss` under usePlural.
		const getModelName = initGetModelName({ usePlural: true, schema });
		expect(getModelName("jwks")).toBe("jwks");
	});

	it("does not double-pluralize a custom model name already ending in s", () => {
		const getModelName = initGetModelName({ usePlural: true, schema });
		expect(getModelName("withAlias")).toBe("custom_tables");
	});

	it("leaves names untouched without usePlural", () => {
		const getModelName = initGetModelName({ usePlural: false, schema });
		expect(getModelName("user")).toBe("user");
		expect(getModelName("jwks")).toBe("jwks");
	});
});
