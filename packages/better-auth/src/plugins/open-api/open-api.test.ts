import type { BetterAuthPlugin } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { createAuthEndpoint } from "../../api";
import { getTestInstance } from "../../test-utils/test-instance";
import { emailOTP } from "../email-otp";
import { openAPI } from ".";
import type { OpenAPISchema, Path } from "./generator";

type PostRequestBody = NonNullable<NonNullable<Path["post"]>["requestBody"]>;

function getPostRequestBody(
	paths: Record<string, Path>,
	path: string,
): PostRequestBody {
	const requestBody = paths[path]?.post?.requestBody;
	if (!requestBody) {
		throw new Error(`Expected ${path} to define a POST request body`);
	}
	return requestBody;
}

function getSchemaProperty(schema: OpenAPISchema, propertyName: string) {
	const property = schema.properties?.[propertyName];
	if (!property) {
		throw new Error(`Expected schema to define ${propertyName}`);
	}
	return property;
}

function getComposedSchemaItem(
	schemas: OpenAPISchema[] | undefined,
	index: number,
) {
	const schema = schemas?.[index];
	if (!schema) {
		throw new Error(`Expected composed schema item at index ${index}`);
	}
	return schema;
}

function getPathParameter(path: Path | undefined, parameterName: string) {
	const parameter = path?.get?.parameters?.find(
		(parameter) => parameter.name === parameterName,
	);
	if (!parameter) {
		throw new Error(`Expected path to define ${parameterName} parameter`);
	}
	return parameter;
}

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

const unionIntersectionPlugin = {
	id: "union-intersection-test",
	endpoints: {
		chooseRole: createAuthEndpoint(
			"/test/choose-role",
			{
				method: "POST",
				body: z
					.object({
						organizationId: z.string().optional(),
					})
					.and(
						z.union([
							z.object({
								roleName: z.string(),
							}),
							z.object({
								roleId: z.string(),
							}),
						]),
					),
			},
			async () => ({ success: true }),
		),
	},
} satisfies BetterAuthPlugin;

const recordIntersectionPlugin = {
	id: "record-intersection-test",
	endpoints: {
		updateFields: createAuthEndpoint(
			"/test/update-fields",
			{
				method: "POST",
				body: z
					.object({
						knownField: z.string(),
					})
					.and(
						z.record(
							z
								.string()
								.min(2)
								.describe("Custom field names must be at least two characters"),
							z.boolean(),
						),
					),
			},
			async () => ({ success: true }),
		),
	},
} satisfies BetterAuthPlugin;

const queryConstraintsPlugin = {
	id: "query-constraints-test",
	endpoints: {
		constrainedQuery: createAuthEndpoint(
			"/test/query-constraints",
			{
				method: "GET",
				query: z.object({
					direct: z.string().min(3),
					optional: z.string().min(4).optional(),
					defaulted: z.string().min(5).default("abcde"),
					bounded: z.string().min(6).max(12),
				}),
			},
			async () => ({ success: true }),
		),
	},
} satisfies BetterAuthPlugin;

let defaultFactoryCallCount = 0;

const defaultFactoryBodyPlugin = {
	id: "default-factory-body-test",
	endpoints: {
		defaultFactoryBody: createAuthEndpoint(
			"/test/default-factory-body",
			{
				method: "POST",
				body: z
					.object({
						nonce: z.string(),
					})
					.default(() => {
						defaultFactoryCallCount++;
						return {
							nonce: `generated-${defaultFactoryCallCount}`,
						};
					}),
			},
			async () => ({ success: true }),
		),
	},
} satisfies BetterAuthPlugin;

let wrapperDefaultFactoryCallCount = 0;

const wrapperSemanticsPlugin = {
	id: "wrapper-semantics-test",
	endpoints: {
		wrapperSemantics: createAuthEndpoint(
			"/test/wrapper-semantics",
			{
				method: "POST",
				body: z.object({
					optionalNullable: z.string().optional().nullable(),
					nullableDefault: z
						.string()
						.default(() => {
							wrapperDefaultFactoryCallCount++;
							return "generated-default";
						})
						.nullable(),
					prefaulted: z.string().prefault("prefaulted-value"),
					nonOptional: z.string().optional().nonoptional(),
					unionOptional: z.union([z.string(), z.undefined()]),
				}),
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
	const { auth: authWithUnionIntersection } = await getTestInstance({
		plugins: [openAPI(), unionIntersectionPlugin],
	});
	const { auth: authWithRecordIntersection } = await getTestInstance({
		plugins: [openAPI(), recordIntersectionPlugin],
	});
	const { auth: authWithQueryConstraints } = await getTestInstance({
		plugins: [openAPI(), queryConstraintsPlugin],
	});
	const { auth: authWithDefaultFactoryBody } = await getTestInstance({
		plugins: [openAPI(), defaultFactoryBodyPlugin],
	});
	const { auth: authWithWrapperSemantics } = await getTestInstance({
		plugins: [openAPI(), wrapperSemanticsPlugin],
	});

	it("should generate OpenAPI schema", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		expect(schema).toBeDefined();
		expect(schema).toMatchSnapshot("openAPISchema");
	});

	it("should mark model id fields as required and read-only", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const schemas = schema.components.schemas as Record<
			string,
			Record<string, any>
		>;
		expect(schemas["User"]!.properties.id).toEqual({
			readOnly: true,
			type: "string",
		});
		expect(schemas["User"]!.required).toContain("id");
		expect(schemas["User"]!.properties.emailVerified).toEqual({
			default: false,
			readOnly: true,
			type: "boolean",
		});
		expect(schemas["User"]!.required).toContain("emailVerified");
		expect(schemas["Session"]!.properties.id).toEqual({
			readOnly: true,
			type: "string",
		});
		expect(schemas["Session"]!.required).toContain("id");
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

	it("should omit runtime-generated defaults from model schemas", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const schemas = schema.components.schemas as Record<
			string,
			Record<string, any>
		>;

		expect(schemas["User"]!.properties.createdAt.default).toBeUndefined();
		expect(schemas["User"]!.properties.updatedAt.default).toBeUndefined();
		expect(schemas["Session"]!.properties.createdAt.default).toBeUndefined();
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
		expect(idTokenType).toBe("object");

		expect(schema_properties.idToken.properties).toBeDefined();
		expect(schema_properties.idToken.properties.token).toBeDefined();
		expect(schema_properties.idToken.properties.token.type).toBe("string");
		expect(schema_properties.idToken.properties.accessToken).toBeDefined();

		const accessTokenType =
			schema_properties.idToken.properties.accessToken.type;
		expect(accessTokenType).toBe("string");

		expect(schema_properties.idToken.properties.refreshToken).toBeDefined();
		const refreshTokenType =
			schema_properties.idToken.properties.refreshToken.type;
		expect(refreshTokenType).toBe("string");

		expect(schema_properties.idToken.required).toContain("token");
		expect(schema_properties.idToken.required).not.toContain("accessToken");
		expect(schema_properties.idToken.required).not.toContain("refreshToken");
	});

	it("should keep optional primitive types non-nullable", async () => {
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

		expect(accessTokenType).toBe("string");

		expect(refreshTokenType).toBe("string");

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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9669
	 */
	it("should emit unique operationIds across multi-method endpoints", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;
		const seen = new Set<string>();

		for (const pathItem of Object.values(paths)) {
			for (const method of ["get", "post", "put", "patch", "delete"]) {
				const id = pathItem[method]?.operationId;
				if (!id) continue;
				expect(seen.has(id)).toBe(false);
				seen.add(id);
			}
		}

		expect(paths["/get-session"].get.operationId).toBe("getSession");
		expect(paths["/get-session"].post.operationId).toBe("getSessionPost");
	});

	it("should infer path parameters for routes with dynamic segments", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		expect(paths["/callback/{id}"].get.parameters).toContainEqual({
			name: "id",
			in: "path",
			required: true,
			schema: {
				type: "string",
			},
		});
		expect(paths["/callback/{id}"].post.parameters).toContainEqual({
			name: "id",
			in: "path",
			required: true,
			schema: {
				type: "string",
			},
		});
	});

	it("should not share operation parameter or response objects across methods", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		expect(paths["/get-session"].get.parameters).not.toBe(
			paths["/get-session"].post.parameters,
		);
		expect(paths["/get-session"].get.responses["200"]).not.toBe(
			paths["/get-session"].post.responses["200"],
		);
		expect(paths["/callback/{id}"].get.parameters).not.toBe(
			paths["/callback/{id}"].post.parameters,
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9669
	 */
	it("should serialize the generated schema without circular response refs", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		expect(paths["/get-session"].get.responses["200"]).not.toBe(
			paths["/get-session"].post.responses["200"],
		);

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/open-api/generate-schema"),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).not.toContain("[Circular ref");
	});

	it("should keep optional object types non-nullable", async () => {
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

		expect(idTokenSchema.type).toBe("object");
		expect(idTokenSchema.anyOf).toBeUndefined();

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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9260
	 */
	it("should not require token/user in /sign-in/social response and allow redirect to be true or false", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;

		const responseSchema =
			paths["/sign-in/social"].post.responses["200"].content["application/json"]
				.schema;

		expect(responseSchema.required).toEqual(["redirect"]);
		expect(responseSchema.required).not.toContain("token");
		expect(responseSchema.required).not.toContain("user");

		expect(responseSchema.properties.redirect.enum).toBeUndefined();
		expect(responseSchema.properties.redirect.type).toBe("boolean");

		expect(responseSchema.properties.token).toBeDefined();
		expect(responseSchema.properties.user).toBeDefined();
		expect(responseSchema.properties.url).toBeDefined();
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

		// Helper to check if field has correct type without evaluating defaults.
		const validateDefaultField = (
			properties: any,
			fieldName: string,
			expectedType: string,
		) => {
			expect(properties[fieldName]).toBeDefined();
			const fieldSchema = properties[fieldName];

			// Check type is correctly inferred - not fallback to "string"
			const baseTypes = getBaseType(fieldSchema.type);
			expect(baseTypes).toContain(expectedType);
			expect(baseTypes).not.toContain("string");
			expect(fieldSchema.default).toBeUndefined();
		};

		// Test sign-in endpoint: z.boolean().default(true).optional()
		const signInPath = paths["/sign-in/email"];
		expect(signInPath).toBeDefined();
		expect(signInPath.post).toBeDefined();
		expect(signInPath.post.requestBody).toBeDefined();

		const signInProps =
			signInPath.post.requestBody.content["application/json"].schema.properties;
		validateDefaultField(signInProps, "rememberMe", "boolean");

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
		expect(signInEmailOTPSchema.properties.name.type).toBe("string");
		expect(signInEmailOTPSchema.properties.image.type).toBe("string");
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
		expect(requestBodySchema.default).toBeUndefined();
	});

	it("should represent object intersections with union branches", async () => {
		const schema = await authWithUnionIntersection.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, Path>;

		const requestBody = getPostRequestBody(paths, "/test/choose-role");
		expect(requestBody.required).toBe(true);

		const requestBodySchema = requestBody.content["application/json"].schema;
		expect(requestBodySchema.allOf).toHaveLength(2);
		expect(getComposedSchemaItem(requestBodySchema.allOf, 0)).toEqual({
			type: "object",
			properties: {
				organizationId: {
					type: "string",
				},
			},
		});
		expect(getComposedSchemaItem(requestBodySchema.allOf, 1)).toEqual({
			anyOf: [
				{
					type: "object",
					properties: {
						roleName: {
							type: "string",
						},
					},
					required: ["roleName"],
				},
				{
					type: "object",
					properties: {
						roleId: {
							type: "string",
						},
					},
					required: ["roleId"],
				},
			],
		});
	});

	it("should preserve record key schemas when merging object intersections", async () => {
		const schema = await authWithRecordIntersection.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, Path>;

		const requestBody = getPostRequestBody(paths, "/test/update-fields");
		const requestBodySchema = requestBody.content["application/json"].schema;

		expect(requestBodySchema.type).toBe("object");
		expect(requestBodySchema.required).toEqual(["knownField"]);
		expect(getSchemaProperty(requestBodySchema, "knownField").type).toBe(
			"string",
		);
		expect(requestBodySchema.additionalProperties).toEqual({
			type: "boolean",
		});
		expect(requestBodySchema.propertyNames).toEqual({
			description: "Custom field names must be at least two characters",
			minLength: 2,
			type: "string",
		});
	});

	it("should preserve string length constraints for wrapped query parameters", async () => {
		const schema = await authWithQueryConstraints.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, Path>;
		const path = paths["/test/query-constraints"];
		expect(path).toBeDefined();

		expect(getPathParameter(path, "direct").schema).toMatchObject({
			minLength: 3,
			type: "string",
		});
		expect(getPathParameter(path, "optional").schema).toMatchObject({
			minLength: 4,
			type: "string",
		});
		expect(getPathParameter(path, "defaulted").schema).toMatchObject({
			minLength: 5,
			type: "string",
		});
		expect(getPathParameter(path, "bounded").schema).toMatchObject({
			maxLength: 12,
			minLength: 6,
			type: "string",
		});
	});

	it("should not evaluate request body default factories", async () => {
		defaultFactoryCallCount = 0;
		const schema = await authWithDefaultFactoryBody.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, Path>;

		const requestBody = getPostRequestBody(paths, "/test/default-factory-body");
		expect(requestBody.required).toBe(false);
		expect(defaultFactoryCallCount).toBe(0);

		const requestBodySchema = requestBody.content["application/json"].schema;
		expect(requestBodySchema.default).toBeUndefined();
		expect(getSchemaProperty(requestBodySchema, "nonce").type).toBe("string");
	});

	it("should compute required fields through Zod wrapper schemas", async () => {
		wrapperDefaultFactoryCallCount = 0;
		const schema = await authWithWrapperSemantics.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, Path>;

		const requestBody = getPostRequestBody(paths, "/test/wrapper-semantics");
		expect(requestBody.required).toBe(true);

		const requestBodySchema = requestBody.content["application/json"].schema;
		expect(requestBodySchema.required).toEqual(["nonOptional"]);
		expect(wrapperDefaultFactoryCallCount).toBe(0);

		expect(
			getSchemaProperty(requestBodySchema, "optionalNullable").type,
		).toEqual(["string", "null"]);
		expect(
			getSchemaProperty(requestBodySchema, "nullableDefault").type,
		).toEqual(["string", "null"]);
		expect(
			getSchemaProperty(requestBodySchema, "nullableDefault").default,
		).toBeUndefined();
		expect(getSchemaProperty(requestBodySchema, "prefaulted").type).toBe(
			"string",
		);
		expect(
			getSchemaProperty(requestBodySchema, "prefaulted").default,
		).toBeUndefined();
		expect(getSchemaProperty(requestBodySchema, "nonOptional").type).toBe(
			"string",
		);
		expect(getSchemaProperty(requestBodySchema, "unionOptional").type).toBe(
			"string",
		);
	});
});
