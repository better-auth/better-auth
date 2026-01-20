import type { GenericEndpointContext } from "@better-auth/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod/v4";
import { buildEndpointSchema } from "./build-endpoint-schema";

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

	describe("additionalFieldsNestedAs edge cases", () => {
		it("should merge nested additional fields with existing base schema property instead of overwriting", () => {
			// This test demonstrates the bug: when the base schema already has a "data" property,
			// and we use additionalFieldsNestedAs: "data", it should MERGE the additional fields
			// into the existing "data" property, not overwrite it entirely.
			const { schema, $Infer } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
					data: z.object({
						existingField: z.string(),
					}),
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

			// Runtime: Should accept both existingField AND customField in data
			const validResult = schema.safeParse({
				name: "Test",
				data: {
					existingField: "existing value",
					customField: "custom value",
				},
			});
			expect(validResult.success).toBe(true);

			// Runtime: Should fail if existingField is missing (from base schema's data)
			const missingExisting = schema.safeParse({
				name: "Test",
				data: {
					customField: "custom value",
				},
			});
			expect(missingExisting.success).toBe(false);

			// Runtime: Should fail if customField is missing (from additional fields)
			const missingCustom = schema.safeParse({
				name: "Test",
				data: {
					existingField: "existing value",
				},
			});
			expect(missingCustom.success).toBe(false);

			// Type: Should include both fields in the data property
			expectTypeOf($Infer.body).toMatchTypeOf<{
				name: string;
				data: {
					existingField: string;
					customField: string;
				};
			}>();
		});

		it("should handle nested additional fields when base schema property is optional", () => {
			const { schema } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
					data: z
						.object({
							existingField: z.string(),
						})
						.optional(),
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

			// Should merge the schemas properly
			const validResult = schema.safeParse({
				name: "Test",
				data: {
					existingField: "existing",
					customField: "custom",
				},
			});
			expect(validResult.success).toBe(true);
		});

		it("should merge optional schema with existing base schema property instead of overwriting", () => {
			// This test demonstrates that optional schemas should also merge with existing properties
			const enableData = true as const;

			const { schema, $Infer } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
					data: z.object({
						existingField: z.string(),
					}),
				}),
				additionalFieldsModel: "test",
				optionalSchema: [
					{
						condition: enableData,
						schema: z.object({
							data: z.object({
								optionalField: z.number(),
							}),
						}),
					},
				] as const,
			});

			// Runtime: Should require both existingField AND optionalField in data
			const validResult = schema.safeParse({
				name: "Test",
				data: {
					existingField: "existing value",
					optionalField: 42,
				},
			});
			expect(validResult.success).toBe(true);

			// Runtime: Should fail if existingField is missing
			const missingExisting = schema.safeParse({
				name: "Test",
				data: {
					optionalField: 42,
				},
			});
			expect(missingExisting.success).toBe(false);

			// Runtime: Should fail if optionalField is missing
			const missingOptional = schema.safeParse({
				name: "Test",
				data: {
					existingField: "existing value",
				},
			});
			expect(missingOptional.success).toBe(false);

			// Type: Should include both fields in the data property
			expectTypeOf($Infer.body).toMatchTypeOf<{
				name: string;
				data: {
					existingField: string;
					optionalField: number;
				};
			}>();
		});

		it("should merge multiple optional schemas with the same nested property", () => {
			const enableFeature1 = true as const;
			const enableFeature2 = true as const;

			const { schema } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
					settings: z.object({
						baseOption: z.boolean(),
					}),
				}),
				additionalFieldsModel: "test",
				optionalSchema: [
					{
						condition: enableFeature1,
						schema: z.object({
							settings: z.object({
								feature1Option: z.string(),
							}),
						}),
					},
					{
						condition: enableFeature2,
						schema: z.object({
							settings: z.object({
								feature2Option: z.number(),
							}),
						}),
					},
				] as const,
			});

			// Should require all settings fields
			const validResult = schema.safeParse({
				name: "Test",
				settings: {
					baseOption: true,
					feature1Option: "value",
					feature2Option: 123,
				},
			});
			expect(validResult.success).toBe(true);

			// Should fail if any settings field is missing
			const missingFeature1 = schema.safeParse({
				name: "Test",
				settings: {
					baseOption: true,
					feature2Option: 123,
				},
			});
			expect(missingFeature1.success).toBe(false);
		});

		it("should handle optional schema merging with optional base property", () => {
			const enableData = true as const;

			const { schema } = buildEndpointSchema({
				baseSchema: z.object({
					name: z.string(),
					data: z
						.object({
							existingField: z.string(),
						})
						.optional(),
				}),
				additionalFieldsModel: "test",
				optionalSchema: [
					{
						condition: enableData,
						schema: z.object({
							data: z.object({
								optionalField: z.number(),
							}),
						}),
					},
				] as const,
			});

			// Should merge and preserve optionality
			const validWithData = schema.safeParse({
				name: "Test",
				data: {
					existingField: "existing",
					optionalField: 42,
				},
			});
			expect(validWithData.success).toBe(true);

			// Should allow omitting the entire data property since base was optional
			const validWithoutData = schema.safeParse({
				name: "Test",
			});
			expect(validWithoutData.success).toBe(true);
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
