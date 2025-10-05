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
		expect(schemas["User"]!.properties.id).toEqual({
			type: "string",
		});
	});

	it("should include additionalFields in the User schema", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const schemas = schema.components.schemas as Record<
			string,
			Record<string, any>
		>;

		expect(schemas["User"]!.properties.role).toEqual({
			type: "string",
			default: "user",
		});

		expect(schemas["User"]!.properties.preferences).toEqual({
			type: "string",
		});
		expect(schemas["User"]!.required).toContain("role");
		expect(schemas["User"]!.required).not.toContain("preferences");
	});

	it("should properly handle nested objects in request body schema", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		const signInSocialPath = paths["/sign-in/social"];
		expect(signInSocialPath).toBeDefined();

		const requestBody = signInSocialPath.post.requestBody;
		expect(requestBody).toBeDefined();

		const schema_properties =
			requestBody.content["application/json"].schema.properties;
		expect(schema_properties.idToken).toBeDefined();
		expect(schema_properties.idToken.type).toBe("object");
		expect(schema_properties.idToken.properties).toBeDefined();
		expect(schema_properties.idToken.properties.token).toBeDefined();
		expect(schema_properties.idToken.properties.token.type).toBe("string");
		expect(schema_properties.idToken.properties.accessToken).toBeDefined();
		expect(schema_properties.idToken.properties.accessToken.type).toBe(
			"string",
		);
		expect(schema_properties.idToken.properties.refreshToken).toBeDefined();
		expect(schema_properties.idToken.properties.refreshToken.type).toBe(
			"string",
		);

		expect(schema_properties.idToken.required).toContain("token");
		expect(schema_properties.idToken.required).not.toContain("accessToken");
		expect(schema_properties.idToken.required).not.toContain("refreshToken");
	});
});
