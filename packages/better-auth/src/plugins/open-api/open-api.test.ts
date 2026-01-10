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
		expect(schema).toMatchSnapshot("openAPISchema");
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

		const idTokenType = schema_properties.idToken.type;
		expect(idTokenType).toContain("object");
		expect(idTokenType).toContain("null");

		expect(schema_properties.idToken.properties).toBeDefined();
		expect(schema_properties.idToken.properties.token).toBeDefined();
		expect(schema_properties.idToken.properties.token.type).toBe("string");
		expect(schema_properties.idToken.properties.accessToken).toBeDefined();

		const accessTokenType =
			schema_properties.idToken.properties.accessToken.type;
		expect(accessTokenType).toContain("string");
		expect(accessTokenType).toContain("null");

		expect(schema_properties.idToken.properties.refreshToken).toBeDefined();
		const refreshTokenType =
			schema_properties.idToken.properties.refreshToken.type;
		expect(refreshTokenType).toContain("string");
		expect(refreshTokenType).toContain("null");

		expect(schema_properties.idToken.required).toContain("token");
		expect(schema_properties.idToken.required).not.toContain("accessToken");
		expect(schema_properties.idToken.required).not.toContain("refreshToken");
	});

	it("should use OpenAPI 3.1 nullable format for optional primitive types", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		const signInSocialPath = paths["/sign-in/social"];
		const schema_properties =
			signInSocialPath.post.requestBody.content["application/json"].schema
				.properties;

		const accessTokenType =
			schema_properties.idToken.properties.accessToken.type;
		const refreshTokenType =
			schema_properties.idToken.properties.refreshToken.type;

		expect(Array.isArray(accessTokenType)).toBe(true);
		expect(accessTokenType).toContain("string");
		expect(accessTokenType).toContain("null");

		expect(Array.isArray(refreshTokenType)).toBe(true);
		expect(refreshTokenType).toContain("string");
		expect(refreshTokenType).toContain("null");

		expect(schema_properties.idToken.properties.accessToken.nullable).toBe(
			undefined,
		);
		expect(schema_properties.idToken.properties.refreshToken.nullable).toBe(
			undefined,
		);
	});

	it("should use anyOf format for optional object types in OpenAPI 3.1", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		const signInSocialPath = paths["/sign-in/social"];
		const schema_properties =
			signInSocialPath.post.requestBody.content["application/json"].schema
				.properties;

		const parentRequired =
			signInSocialPath.post.requestBody.content["application/json"].schema
				.required;
		const isIdTokenOptional = !parentRequired?.includes("idToken");
		expect(isIdTokenOptional).toBe(true);

		const idTokenSchema = schema_properties.idToken;
		const _hasAnyOf = idTokenSchema.anyOf !== undefined;
		const hasTypeArrayWithNull =
			Array.isArray(idTokenSchema.type) && idTokenSchema.type.includes("null");

		expect(hasTypeArrayWithNull).toBe(true);

		expect(idTokenSchema.nullable).toBe(undefined);
	});

	it("should generate OpenAPI 3.1 compliant schemas from Zod types", async () => {
		const schema = await auth.api.generateOpenAPISchema();

		expect(schema.openapi).toMatch(/^3\.1\./);

		const paths = schema.paths as Record<string, any>;
		const signInSocialPath = paths["/sign-in/social"];

		const requestBodySchema =
			signInSocialPath.post.requestBody.content["application/json"].schema;

		const checkNoNullable = (obj: any, path = ""): void => {
			if (obj === null || obj === undefined) return;

			if (typeof obj === "object") {
				for (const key in obj) {
					if (key === "nullable") {
						throw new Error(
							`Found deprecated 'nullable' property at ${path}.${key}`,
						);
					}
					if (typeof obj[key] === "object") {
						checkNoNullable(obj[key], `${path}.${key}`);
					}
				}
			}
		};

		expect(() =>
			checkNoNullable(requestBodySchema, "signInSocialRequestBody"),
		).not.toThrow();
	});

	it("should correctly unwrap ZodDefault and infer inner type", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		// Helper to extract base type from type array
		const getBaseType = (type: any) => {
			if (Array.isArray(type)) {
				return type.filter((t) => t !== "null");
			}
			return [type];
		};

		// Helper to check if field has correct type and default value
		const validateDefaultField = (
			properties: any,
			fieldName: string,
			expectedType: string,
			expectedDefault?: any,
		) => {
			expect(properties[fieldName]).toBeDefined();
			const fieldSchema = properties[fieldName];

			// Check type is correctly inferred - not fallback to "string"
			const baseTypes = getBaseType(fieldSchema.type);
			expect(baseTypes).toContain(expectedType);
			expect(baseTypes).not.toContain("string");

			// Check default value is included if expected
			if (expectedDefault !== undefined) {
				expect(fieldSchema.default).toBe(expectedDefault);
			}
		};

		// Test sign-in endpoint: z.boolean().default(true).optional()
		const signInPath = paths["/sign-in/email"];
		expect(signInPath).toBeDefined();
		expect(signInPath.post).toBeDefined();
		expect(signInPath.post.requestBody).toBeDefined();

		const signInProps =
			signInPath.post.requestBody.content["application/json"].schema.properties;
		validateDefaultField(signInProps, "rememberMe", "boolean", true);

		// Test sign-up endpoint: z.boolean().optional() - no default
		const signUpPath = paths["/sign-up/email"];
		expect(signUpPath).toBeDefined();
		expect(signUpPath.post).toBeDefined();
		expect(signUpPath.post.requestBody).toBeDefined();

		const signUpProps =
			signUpPath.post.requestBody.content["application/json"].schema.properties;
		// Should still be boolean, just without default
		expect(signUpProps.rememberMe).toBeDefined();
		const baseTypes = getBaseType(signUpProps.rememberMe.type);
		expect(baseTypes).toContain("boolean");
	});
});
