import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { openAPI } from ".";

describe("open-api", async (it) => {
	const { auth } = await getTestInstance({
		plugins: [openAPI()],
		user: {
			additionalFields: {
				role: {
					type: "string",
					required: true,
					defaultValue: "user",
				},
				preferences: {
					type: "string",
					required: false,
				},
			},
		},
	});

	it("should generate OpenAPI schema", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		expect(schema).toBeDefined();
	});

	it("should have an id field in the User schema", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const schemas = schema.components.schemas as Record<
			string,
			Record<string, any>
		>;
		expect(schemas["User"].properties.id).toEqual({
			type: "string",
		});
	});

	it("should include additionalFields in the User schema", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const schemas = schema.components.schemas as Record<
			string,
			Record<string, any>
		>;

		expect(schemas["User"].properties.role).toEqual({
			type: "string",
			default: "user",
		});

		expect(schemas["User"].properties.preferences).toEqual({
			type: "string",
		});
		expect(schemas["User"].required).toContain("role");
		expect(schemas["User"].required).not.toContain("preferences");
	});
});
