import type { GenericEndpointContext } from "@better-auth/core";
import * as z from "zod/v4";
import type {
	DBFieldAttribute,
	InferAdditionalFieldsFromPluginOptions,
} from "../../../db";
import { toZodSchema } from "../../../db";
import type { UnionToIntersection } from "../../../types/helper";

/**
 * Safely extends a ZodObject with another schema's shape, merging nested ZodObjects
 * instead of overwriting them. This is useful when you want to add fields to a
 * nested object without losing the existing fields.
 *
 * @param baseSchema - The base ZodObject schema to extend
 * @param extensionSchema - The ZodObject schema containing fields to add
 * @returns A new ZodObject with merged properties
 */
const safeExtendSchema = (
	baseSchema: z.ZodObject<any>,
	extensionSchema: z.ZodObject<any>,
): z.ZodObject<any> => {
	const extensionShape = extensionSchema.shape;
	const baseShape = baseSchema.shape;
	const mergedShape: Record<string, z.ZodType<any>> = {};

	// Process each key in the extension schema
	for (const key of Object.keys(extensionShape)) {
		const extensionValue = extensionShape[key];
		const existingValue = baseShape[key];

		if (existingValue) {
			// Unwrap optionals to get the inner schemas
			let innerExisting = existingValue;
			let innerExtension = extensionValue;
			let existingIsOptional = false;

			if (innerExisting instanceof z.ZodOptional) {
				existingIsOptional = true;
				innerExisting = innerExisting.unwrap();
			}

			if (innerExtension instanceof z.ZodOptional) {
				innerExtension = innerExtension.unwrap();
			}

			// If both are ZodObjects, merge them recursively
			if (
				innerExisting instanceof z.ZodObject &&
				innerExtension instanceof z.ZodObject
			) {
				const mergedInner = safeExtendSchema(innerExisting, innerExtension);
				// Preserve optionality: only make optional if base was optional
				mergedShape[key] = existingIsOptional
					? mergedInner.optional()
					: mergedInner;
			} else {
				// Can't merge, overwrite with extension value
				mergedShape[key] = extensionValue;
			}
		} else {
			// No existing property, just add the extension value
			mergedShape[key] = extensionValue;
		}
	}

	return baseSchema.safeExtend(mergedShape);
};

type InferOptionalSchemaType<
	Fields extends readonly {
		condition: boolean;
		schema: z.ZodObject<any>;
	}[],
> = [Fields[number]] extends [never]
	? {}
	: Fields extends readonly (infer Item)[]
		? UnionToIntersection<
				Item extends { condition: infer C; schema: infer S }
					? C extends false
						? never
						: S extends z.ZodObject<any>
							? z.infer<S>
							: never
					: never
			> extends infer Result
			? [Result] extends [never]
				? {}
				: Result
			: {}
		: {};

type InferOptionalSchemaTypeForGetBody<
	Fields extends readonly {
		condition: boolean;
		schema: z.ZodObject<any>;
	}[],
> = [Fields[number]] extends [never]
	? {}
	: Fields extends readonly (infer Item)[]
		? UnionToIntersection<
				Item extends { schema: infer S }
					? S extends z.ZodObject<any>
						? Partial<z.infer<S>>
						: never
					: never
			> extends infer Result
			? [Result] extends [never]
				? {}
				: Result
			: {}
		: {};

/**
 * This helper function exists because of the limitations of zod's definition
 * to type inference capabilities, as well as other quality of life features required
 * to build a Zod schema for endpoints.
 *
 * One feature this helper does is provides a way to convert Better Auth schema's into Zod schema's
 * and merges them with the base schema. This is useful in cases where a
 * BA schema that supports user-defined additional fields is needed as options of an endpoint.
 *
 * Additionally, this helper provides type inference for both the input and output types of the body.
 * (For example, if a BA schema has `input: false`, the input type will not include that field. Where as
 * the output type will include it.)
 *
 * There is also an `optionalSchema` option that allows you to pass a condition to allow a Zod schema to be
 * added to the base zod schema & type interface.
 *
 *
 * For a good idea of the purpose of this helper, see both the example below, as well as
 * implementation in the create-organization endpoint code.
 *
 * @example
 * ```ts
 *	const { $Infer, schema } = buildEndpointSchema({
 * 		baseSchema: baseOrganizationSchema,
 *		additionalFields: {
 *			schema: options?.schema,
 *			model: "organization", // using Org table for additional fields
 *		},
 *		optionalSchema: [
 *			{
 *				condition: !options.disableSlugs,
 *				schema: z.object({
 *					slug: z.string().min(1).meta({
 *						description: "The slug of the organization",
 *					}),
 *				}),
 *			},
 *		],
 *	});
 * ```
 *
 *
 * @param opts - The options for the buildEndpointSchema function.
 * @returns The schema, $Infer, $ReturnAdditionalFields, and getBody function.
 */
export const buildEndpointSchema = <
	SchemaName extends string,
	S extends
		| {
				[key in string]?:
					| {
							fields?:
								| {
										[key in string]: string;
								  }
								| undefined;
							additionalFields?:
								| {
										[key in string]: DBFieldAttribute;
								  }
								| undefined;
					  }
					| undefined;
		  }
		| undefined,
	BaseSchema extends z.ZodObject<any>,
	AllPartial extends boolean = false,
	AdditionalFieldsNestedAs extends string | undefined = undefined,
	OptionalSchema extends readonly {
		condition: boolean;
		schema: z.ZodObject<any>;
	}[] = [],
>(opts: {
	/**
	 * The base zod schema which optional & additional fields will be merged into.
	 */
	baseSchema: BaseSchema;
	/**
	 * Whether to make the additional fields partial.
	 */
	shouldBePartial?: AllPartial;
	additionalFieldsSchema?: S | undefined;
	additionalFieldsModel: SchemaName;
	additionalFieldsNestedAs?: AdditionalFieldsNestedAs;
	/**
	 * The optional schemas to add to the schema based on a condition.
	 * Each item should have a condition (boolean) and a Zod schema.
	 */
	optionalSchema?: OptionalSchema;
}) => {
	const {
		baseSchema,
		shouldBePartial,
		optionalSchema,
		additionalFieldsModel: schemaName,
		additionalFieldsSchema: schemaConfig,
		additionalFieldsNestedAs,
	} = opts;

	// Process additional fields from Better Auth schema
	const additionalFields = {
		...(schemaConfig?.[schemaName]?.additionalFields || {}),
	};

	if (shouldBePartial) {
		for (const key in additionalFields) {
			additionalFields[key]!.required = false;
		}
	}

	const additionalFieldsSchema = toZodSchema({
		fields: additionalFields,
		isClientSide: true,
	});

	// Process optional schemas based on conditions
	const optionalSchemas = optionalSchema
		? optionalSchema.filter((f) => f.condition).map((f) => f.schema)
		: [];

	// Build the final schema by extending base schema with additional and optional fields
	let schema: z.ZodObject<any>;

	// Create the schema to extend with (either nested or flat additional fields)
	const additionalFieldsExtension = additionalFieldsNestedAs
		? z.object({ [additionalFieldsNestedAs]: additionalFieldsSchema })
		: additionalFieldsSchema;

	// Start with base schema extended with additional fields (safely merging nested objects)
	schema = safeExtendSchema(baseSchema, additionalFieldsExtension);

	// Apply optional schemas (safely merging nested objects)
	for (const optionalSchemaItem of optionalSchemas) {
		schema = safeExtendSchema(schema, optionalSchemaItem);
	}

	// Type inference helpers
	type AdditionalFields = AllPartial extends true
		? Partial<InferAdditionalFieldsFromPluginOptions<SchemaName, { schema: S }>>
		: InferAdditionalFieldsFromPluginOptions<SchemaName, { schema: S }>;

	type ReturnAdditionalFields = InferAdditionalFieldsFromPluginOptions<
		SchemaName,
		{ schema: S },
		false
	>;

	type NestedAdditionalFields = AdditionalFieldsNestedAs extends string
		? {
				[K in AdditionalFieldsNestedAs]: AdditionalFields;
			}
		: AdditionalFields;

	const $Infer = {
		body: {} as NestedAdditionalFields &
			z.infer<BaseSchema> &
			InferOptionalSchemaType<OptionalSchema>,
	};

	type BodyType = NestedAdditionalFields &
		z.infer<BaseSchema> &
		InferOptionalSchemaTypeForGetBody<OptionalSchema>;

	const getBody = (ctx: GenericEndpointContext): BodyType => {
		return ctx.body as BodyType;
	};

	return {
		schema,
		$Infer,
		$ReturnAdditionalFields: {} as ReturnAdditionalFields,
		getBody,
	};
};
