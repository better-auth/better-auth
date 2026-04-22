import type { BetterAuthPlugin } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { createAuthEndpoint } from "../../api";
import { getTestInstance } from "../../test-utils/test-instance";
import { emailOTP } from "../email-otp";
import { openAPI } from ".";

const nullableIntersectionPlugin = {
	id: "nullable-intersection-test",
	endpoints: {
		nullableIntersection: createAuthEndpoint(
			"/test/nullable-intersection",
			{
				method: "POST",
				body: z
					.object({
						email: z.string(),
					})
					.nullable()
					.and(
						z
							.object({
								otp: z.string(),
							})
							.nullable(),
					),
				metadata: {
					openapi: {
						operationId: "nullableIntersectionTest",
						description: "Test nullable object intersection request bodies",
						responses: {
							200: {
								description: "Success",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												success: {
													type: "boolean",
												},
											},
											required: ["success"],
										},
									},
								},
							},
						},
					},
				},
			},
			async () => ({ success: true }),
		),
	},
} satisfies BetterAuthPlugin;

const defaultBodyPlugin = {
	id: "default-body-test",
	endpoints: {
		defaultBody: createAuthEndpoint(
			"/test/default-body",
			{
				method: "POST",
				body: z
					.object({
						rememberMe: z.boolean(),
					})
					.default({
						rememberMe: true,
					}),
				metadata: {
					openapi: {
						operationId: "defaultBodyTest",
						description: "Test default-wrapped request bodies",
						responses: {
							200: {
								description: "Success",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												success: {
													type: "boolean",
												},
											},
											required: ["success"],
										},
									},
								},
							},
						},
					},
				},
			},
			async () => ({ success: true }),
		),
	},
} satisfies BetterAuthPlugin;

describe("open-api", async () => {
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
	const { auth: authWithEmailOTP } = await getTestInstance({
		plugins: [
			openAPI(),
			emailOTP({
				sendVerificationOTP: async () => {},
			}),
		],
	});
	const { auth: authWithNullableIntersection } = await getTestInstance({
		plugins: [openAPI(), nullableIntersectionPlugin],
	});
	const { auth: authWithDefaultBody } = await getTestInstance({
		plugins: [openAPI(), defaultBodyPlugin],
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

	it("should use OpenAPI 3.1 nullable format for get-session response", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		const getSessionSchema =
			paths["/get-session"].post.responses["200"].content["application/json"]
				.schema;

		expect(Array.isArray(getSessionSchema.type)).toBe(true);
		expect(getSessionSchema.type).toContain("object");
		expect(getSessionSchema.type).toContain("null");
		expect(getSessionSchema.nullable).toBe(undefined);
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

	it("should include request bodies for all email OTP POST endpoints", async () => {
		const schema = await authWithEmailOTP.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;
		const emailOTPPostPaths = [
			"/email-otp/send-verification-otp",
			"/email-otp/check-verification-otp",
			"/email-otp/verify-email",
			"/sign-in/email-otp",
			"/email-otp/request-password-reset",
			"/forget-password/email-otp",
			"/email-otp/reset-password",
			"/email-otp/request-email-change",
			"/email-otp/change-email",
		];

		for (const path of emailOTPPostPaths) {
			expect(paths[path]?.post?.requestBody).toBeDefined();
		}
	});

	it("should merge object and record intersections for email OTP sign-in request bodies", async () => {
		const schema = await authWithEmailOTP.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		const signInEmailOTPRequestBody =
			paths["/sign-in/email-otp"].post.requestBody;
		expect(signInEmailOTPRequestBody.required).toBe(true);

		const signInEmailOTPSchema =
			signInEmailOTPRequestBody.content["application/json"].schema;
		expect(signInEmailOTPSchema.type).toBe("object");
		expect(signInEmailOTPSchema.required).toEqual(["email", "otp"]);
		expect(signInEmailOTPSchema.properties.email.type).toBe("string");
		expect(signInEmailOTPSchema.properties.otp.type).toBe("string");
		expect(signInEmailOTPSchema.properties.name.type).toEqual([
			"string",
			"null",
		]);
		expect(signInEmailOTPSchema.properties.image.type).toEqual([
			"string",
			"null",
		]);
		expect(signInEmailOTPSchema.additionalProperties).toEqual({});
	});

	it("should keep plain email OTP request bodies as object schemas", async () => {
		const schema = await authWithEmailOTP.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		const resetPasswordRequestBody =
			paths["/email-otp/reset-password"].post.requestBody;
		expect(resetPasswordRequestBody.required).toBe(true);

		const resetPasswordSchema =
			resetPasswordRequestBody.content["application/json"].schema;
		expect(resetPasswordSchema.type).toBe("object");
		expect(resetPasswordSchema.required).toEqual(["email", "otp", "password"]);
		expect(resetPasswordSchema.additionalProperties).toBeUndefined();
	});

	it("should preserve nullable object intersections when merging schemas", async () => {
		const schema =
			await authWithNullableIntersection.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		const requestBody = paths["/test/nullable-intersection"].post.requestBody;
		expect(requestBody.required).toBe(true);

		const requestBodySchema = requestBody.content["application/json"].schema;
		expect(requestBodySchema.type).toEqual(["object", "null"]);
		expect(requestBodySchema.properties.email.type).toBe("string");
		expect(requestBodySchema.properties.otp.type).toBe("string");
		expect(requestBodySchema.required).toEqual(["email", "otp"]);
	});

	it("should mark default-wrapped request bodies as optional", async () => {
		const schema = await authWithDefaultBody.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		const requestBody = paths["/test/default-body"].post.requestBody;
		expect(requestBody.required).toBe(false);

		const requestBodySchema = requestBody.content["application/json"].schema;
		expect(requestBodySchema.type).toBe("object");
		expect(requestBodySchema.properties.rememberMe.type).toBe("boolean");
		expect(requestBodySchema.default).toEqual({ rememberMe: true });
	});
});
