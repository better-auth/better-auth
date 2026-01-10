import type { GenericEndpointContext } from "@better-auth/core";
import type * as z from "zod";
import type {
	DBFieldAttribute,
	InferAdditionalFieldsFromPluginOptions,
} from "../../../db";
import { toZodSchema } from "../../../db";

export const buildEndpointSchema = <
	SchemaName extends string,
	S extends {
		[key in SchemaName]?: {
			additionalFields?: Record<string, DBFieldAttribute>;
		};
	},
	BaseSchema extends z.ZodObject<any>,
	AllPartial extends boolean = false,
>(opts: {
	name: SchemaName;
	schema: S | undefined;
	baseSchema: BaseSchema;
	shouldBePartial?: AllPartial;
}) => {
	return {
		build: buildEndpointSchema,
		...build(opts),
	};
};

function build<
	SchemaName extends string,
	S extends {
		[key in SchemaName]?: {
			additionalFields?: Record<string, DBFieldAttribute>;
		};
	},
	BaseSchema extends z.ZodObject<any>,
	AllPartial extends boolean = false,
>(opts: {
	name: SchemaName;
	schema: S | undefined;
	baseSchema: BaseSchema;
	shouldBePartial?: AllPartial;
}) {
	const {
		schema: schema1,
		baseSchema,
		name: schemaName,
		shouldBePartial,
	} = opts;
	let additionalFields = schema1?.[schemaName]?.additionalFields || {};
	if (shouldBePartial) {
		for (const key in additionalFields) {
			additionalFields[key]!.required = false;
		}
	}
	const additionalFieldsSchema = toZodSchema({
		fields: additionalFields,
		isClientSide: true,
	});

	type AdditionalFields = AllPartial extends true
		? Partial<InferAdditionalFieldsFromPluginOptions<SchemaName, { schema: S }>>
		: InferAdditionalFieldsFromPluginOptions<SchemaName, { schema: S }>;
	type ReturnAdditionalFields = InferAdditionalFieldsFromPluginOptions<
		SchemaName,
		{ schema: S },
		false
	>;

	const schema = baseSchema.safeExtend(additionalFieldsSchema.shape);
	const $Infer = {
		body: {} as AdditionalFields & z.infer<BaseSchema>,
	};

	return {
		schema,
		$Infer,
		$ReturnAdditionalFields: {} as ReturnAdditionalFields,
		/**
		 * A utility function to return the body with the correct type.
		 *
		 * @param ctx Endpoint context
		 * @returns Type-transformed body
		 */
		getBody: (ctx: GenericEndpointContext) =>
			ctx.body as AdditionalFields & z.infer<BaseSchema>,
	};
}
