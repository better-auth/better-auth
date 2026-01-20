import type { GenericEndpointContext } from "@better-auth/core";
import * as z from "zod/v4";
import type {
	DBFieldAttribute,
	InferAdditionalFieldsFromPluginOptions,
} from "../../../db";
import { toZodSchema } from "../../../db";
import type { UnionToIntersection } from "../../../types/helper";

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
	const additionalFields = schemaConfig?.[schemaName]?.additionalFields || {};

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

	const additionalFieldsShape = additionalFieldsNestedAs
		? (z.object({ [additionalFieldsNestedAs]: additionalFieldsSchema.shape })
				.shape as unknown as {
				[x: string]: z.ZodOptional<z.ZodAny>;
			})
		: additionalFieldsSchema.shape;

	// Build the final schema by extending base schema with additional and optional fields
	let schema = baseSchema.safeExtend(additionalFieldsShape);
	for (const optionalSchemaItem of optionalSchemas) {
		schema = schema.safeExtend(optionalSchemaItem.shape);
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

	const $Infer = {
		body: {} as (AdditionalFieldsNestedAs extends string
			? {
					[K in AdditionalFieldsNestedAs]: AdditionalFields;
				}
			: AdditionalFields) &
			z.infer<BaseSchema> &
			InferOptionalSchemaType<OptionalSchema>,
	};

	type BodyType = AdditionalFields &
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
