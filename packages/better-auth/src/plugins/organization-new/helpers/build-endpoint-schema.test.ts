import { describe, it, expect, expectTypeOf } from "vitest";
import { buildEndpointSchema } from "./build-endpoint-schema";
import * as z from "zod/v4";
import type { GenericEndpointContext } from "@better-auth/core";

describe("buildEndpointSchema", () => {
	describe("runtime schema building", () => {
		it("should build schema with only base schema", () => {
			const { schema } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
					age: z.number(),
				}),
				additionalFieldsModel: "test",
			});

			// Valid data should pass
			const validResult = schema.safeParse({ name: "John", age: 30 });
			expect(validResult.success).toBe(true);

			// Invalid data should fail
			const invalidResult = schema.safeParse({ name: 123, age: "thirty" });
			expect(invalidResult.success).toBe(false);
		});

		it("should include additional fields in the schema", () => {
			const { schema } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsSchema: {
					organization: {
						additionalFields: {
							customField: { type: "string", required: true, input: true },
							optionalField: { type: "number", required: false, input: true },
						},
					},
				},
				additionalFieldsModel: "organization",
			});

			// Valid data with required additional field
			const validResult = schema.safeParse({
				name: "Test Org",
				customField: "custom value",
			});
			expect(validResult.success).toBe(true);

			// Missing required additional field should fail
			const missingRequired = schema.safeParse({ name: "Test Org" });
			expect(missingRequired.success).toBe(false);

			// Optional field can be omitted
			const withOptional = schema.safeParse({
				name: "Test Org",
				customField: "value",
				optionalField: 42,
			});
			expect(withOptional.success).toBe(true);
		});

		it("should include optional schema when condition is true", () => {
			const enableSlug = true;
			const { schema } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsModel: "test",
				optionalSchema: [
					{
						condition: enableSlug,
						schema: z.object({
							slug: z.string().min(1),
						}),
					},
				] as const,
			});

			// Should require slug when condition is true
			const withoutSlug = schema.safeParse({ name: "Test" });
			expect(withoutSlug.success).toBe(false);

			const withSlug = schema.safeParse({ name: "Test", slug: "test-slug" });
			expect(withSlug.success).toBe(true);
		});

		it("should exclude optional schema when condition is false", () => {
			const enableSlug = false;
			const { schema } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsModel: "test",
				optionalSchema: [
					{
						condition: enableSlug,
						schema: z.object({
							slug: z.string().min(1),
						}),
					},
				] as const,
			});

			// Should not require slug when condition is false
			const withoutSlug = schema.safeParse({ name: "Test" });
			expect(withoutSlug.success).toBe(true);
		});

		it("should make additional fields partial when shouldBePartial is true", () => {
			const { schema } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsSchema: {
					organization: {
						additionalFields: {
							requiredField: { type: "string", required: true, input: true },
						},
					},
				},
				additionalFieldsModel: "organization",
				shouldBePartial: true,
			});

			// Field should be optional when shouldBePartial is true
			const withoutRequired = schema.safeParse({ name: "Test" });
			expect(withoutRequired.success).toBe(true);
		});

		it("should handle multiple optional schemas", () => {
			const enableSlug = true;
			const enableMetadata = true;

			const { schema } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsModel: "test",
				optionalSchema: [
					{
						condition: enableSlug,
						schema: z.object({ slug: z.string() }),
					},
					{
						condition: enableMetadata,
						schema: z.object({ metadata: z.record(z.string(), z.any()) }),
					},
				] as const,
			});

			const result = schema.safeParse({
				name: "Test",
				slug: "test-slug",
				metadata: { key: "value" },
			});
			expect(result.success).toBe(true);
		});

		it("should exclude fields with input: false from the schema", () => {
			const { schema } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsSchema: {
					organization: {
						additionalFields: {
							inputField: { type: "string", required: true, input: true },
							serverOnlyField: {
								type: "string",
								required: true,
								input: false,
							},
						},
					},
				},
				additionalFieldsModel: "organization",
			});

			// Should only require the input field, not serverOnlyField
			const result = schema.safeParse({
				name: "Test",
				inputField: "value",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("type inference", () => {
		it("should infer base schema types correctly", () => {
			const { $Infer } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
					count: z.number(),
					isActive: z.boolean(),
				}),
				additionalFieldsModel: "test",
			});

			expectTypeOf($Infer.body).toMatchTypeOf<{
				name: string;
				count: number;
				isActive: boolean;
			}>();
		});

		it("should infer additional fields types correctly", () => {
			const { $Infer } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsSchema: {
					organization: {
						additionalFields: {
							customString: { type: "string", required: true, input: true },
							customNumber: { type: "number", required: true, input: true },
							optionalBoolean: {
								type: "boolean",
								required: false,
								input: true,
							},
						},
					},
				},
				additionalFieldsModel: "organization",
			});

			expectTypeOf($Infer.body).toMatchTypeOf<{
				name: string;
				customString: string;
				customNumber: number;
			}>();

			// Optional field should be optional in the type
			expectTypeOf($Infer.body).toMatchTypeOf<{
				optionalBoolean?: boolean;
			}>();
		});

		it("should infer optional schema types when condition is true", () => {
			const enableSlug = true as const;

			const { $Infer } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsModel: "test",
				optionalSchema: [
					{
						condition: enableSlug,
						schema: z.object({
							slug: z.string(),
						}),
					},
				] as const,
			});

			expectTypeOf($Infer.body).toMatchTypeOf<{
				name: string;
				slug: string;
			}>();
		});

		it("should not include optional schema types when condition is false", () => {
			const enableSlug = false as const;

			const { $Infer } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsModel: "test",
				optionalSchema: [
					{
						condition: enableSlug,
						schema: z.object({
							slug: z.string(),
						}),
					},
				] as const,
			});

			expectTypeOf($Infer.body).toMatchTypeOf<{
				name: string;
			}>();

			// @ts-expect-error - slug should not be in the type when condition is false
			expectTypeOf($Infer.body).toMatchTypeOf<{
				name: string;
				slug: string;
			}>();
		});

		it("should exclude input: false fields from $Infer.body", () => {
			const { $Infer } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsSchema: {
					organization: {
						additionalFields: {
							inputField: { type: "string", required: true, input: true },
							serverOnlyField: {
								type: "string",
								required: true,
								input: false,
							},
						},
					},
				},
				additionalFieldsModel: "organization",
			});

			expectTypeOf($Infer.body).toMatchTypeOf<{
				name: string;
				inputField: string;
			}>();
		});

		it("should include input: false fields in $ReturnAdditionalFields", () => {
			const { $ReturnAdditionalFields } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsSchema: {
					organization: {
						additionalFields: {
							inputField: { type: "string", required: true, input: true },
							serverOnlyField: {
								type: "string",
								required: true,
								input: false,
							},
						},
					},
				},
				additionalFieldsModel: "organization",
			});

			expectTypeOf($ReturnAdditionalFields).toMatchTypeOf<{
				inputField: string;
				serverOnlyField: string;
			}>();
		});

		it("should make additional fields partial when shouldBePartial is true", () => {
			const { $Infer } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsSchema: {
					organization: {
						additionalFields: {
							requiredField: { type: "string", required: true, input: true },
						},
					},
				},
				additionalFieldsModel: "organization",
				shouldBePartial: true,
			});

			// When shouldBePartial is true, additional fields should be partial
			expectTypeOf($Infer.body).toMatchTypeOf<{
				name: string;
				requiredField?: string;
			}>();
		});

		it("should infer getBody return type correctly", () => {
			const { getBody } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
					count: z.number(),
				}),
				additionalFieldsSchema: {
					test: {
						additionalFields: {
							extra: { type: "string", required: true, input: true },
						},
					},
				},
				additionalFieldsModel: "test",
			});

			const mockCtx = { body: {} } as GenericEndpointContext;
			const body = getBody(mockCtx);

			expectTypeOf(body).toMatchTypeOf<{
				name: string;
				count: number;
				extra: string;
			}>();
		});

		it("should handle nested additional fields with additionalFieldsNestedAs", () => {
			const { $Infer } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
				}),
				additionalFieldsSchema: {
					organization: {
						additionalFields: {
							customField: { type: "string", required: true, input: true },
						},
					},
				},
				additionalFieldsModel: "organization",
				additionalFieldsNestedAs: "data",
			});

			expectTypeOf($Infer.body).toMatchTypeOf<{
				name: string;
				data: {
					customField: string;
				};
			}>();
		});

		it("should infer correct types for various field types", () => {
			const { $Infer } = buildEndpointSchema({
				baseSchema: z.object({
					id: z.string(),
				}),
				additionalFieldsSchema: {
					test: {
						additionalFields: {
							stringField: { type: "string", required: true, input: true },
							numberField: { type: "number", required: true, input: true },
							booleanField: { type: "boolean", required: true, input: true },
							dateField: { type: "date", required: true, input: true },
							stringArrayField: {
								type: "string[]",
								required: true,
								input: true,
							},
							numberArrayField: {
								type: "number[]",
								required: true,
								input: true,
							},
						},
					},
				},
				additionalFieldsModel: "test",
			});

			expectTypeOf($Infer.body).toMatchTypeOf<{
				id: string;
				stringField: string;
				numberField: number;
				booleanField: boolean;
				dateField: Date;
				stringArrayField: string[];
				numberArrayField: number[];
			}>();
		});
	});

	describe("combined runtime and type tests", () => {
		it("should work with complex schema configuration", () => {
			const enableSlug = true as const;
			const enableMetadata = false as const;

			const { schema, $Infer } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string().min(1),
					description: z.string().optional(),
				}),
				additionalFieldsSchema: {
					organization: {
						additionalFields: {
							tier: { type: "string", required: true, input: true },
							maxUsers: { type: "number", required: false, input: true },
							internalId: { type: "string", required: true, input: false },
						},
					},
				},
				additionalFieldsModel: "organization",
				optionalSchema: [
					{
						condition: enableSlug,
						schema: z.object({ slug: z.string().min(1) }),
					},
					{
						condition: enableMetadata,
						schema: z.object({ metadata: z.record(z.string(), z.any()) }),
					},
				] as const,
			});

			// Type should include base, additional (with input: true), and enabled optional schemas
			expectTypeOf($Infer.body).toMatchTypeOf<{
				name: string;
				tier: string;
				slug: string;
			}>();

			// Runtime validation should work
			const validResult = schema.safeParse({
				name: "My Org",
				tier: "premium",
				slug: "my-org",
			});
			expect(validResult.success).toBe(true);

			// Missing required fields should fail
			const missingTier = schema.safeParse({
				name: "My Org",
				slug: "my-org",
			});
			expect(missingTier.success).toBe(false);
		});
	});
});
