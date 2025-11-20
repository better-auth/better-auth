import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type { Prettify } from "better-call";
import * as z from "zod";
import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import { generateId } from "../../utils";
import type { GraphOptions } from "./types";

type InferSchema<
	Schema extends BetterAuthPluginDBSchema,
	TableName extends string,
	DefaultFields,
> = {
	modelName: Schema[TableName] extends { modelName: infer M }
		? M extends string
			? M
			: string
		: string;
	fields: {
		[K in keyof DefaultFields]: DefaultFields[K];
	} & (Schema[TableName] extends { additionalFields: infer F } ? F : {});
};

interface ObjectDefaultFields {
	type: {
		type: "string";
		required: true;
	};
	externalId: {
		type: "string";
		required: false;
	};
	externalType: {
		type: "string";
		required: false;
	};
	attributes: {
		type: "string";
		required: false;
	};
	metadata: {
		type: "string";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface RelationshipDefaultFields {
	subjectId: {
		type: "string";
		required: true;
		references: {
			model: "object";
			field: "id";
			onDelete: "cascade";
		};
	};
	subjectType: {
		type: "string";
		required: true;
	};
	objectId: {
		type: "string";
		required: true;
		references: {
			model: "object";
			field: "id";
			onDelete: "cascade";
		};
	};
	objectType: {
		type: "string";
		required: true;
	};
	relationshipType: {
		type: "string";
		required: true;
	};
	attributes: {
		type: "string";
		required: false;
	};
	metadata: {
		type: "string";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface SchemaDefinitionDefaultFields {
	version: {
		type: "string";
		required: true;
	};
	definition: {
		type: "string";
		required: true;
	};
	isActive: {
		type: "boolean";
		required: false;
		defaultValue: true;
	};
	metadata: {
		type: "string";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
	createdBy: {
		type: "string";
		required: false;
		references: {
			model: "user";
			field: "id";
			onDelete: "set null";
		};
	};
}

export type GraphSchema<O extends GraphOptions> = {
	object: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"object",
		ObjectDefaultFields
	>;
	relationship: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"relationship",
		RelationshipDefaultFields
	>;
	schemaDefinition: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"schemaDefinition",
		SchemaDefinitionDefaultFields
	>;
};

export const objectSchema = z.object({
	id: z.string().default(generateId),
	type: z.string(),
	externalId: z.string().nullish().optional(),
	externalType: z.string().nullish().optional(),
	attributes: z
		.record(z.string(), z.unknown())
		.or(z.string().transform((v) => JSON.parse(v)))
		.nullish()
		.optional(),
	metadata: z
		.record(z.string(), z.unknown())
		.or(z.string().transform((v) => JSON.parse(v)))
		.nullish()
		.optional(),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().nullish().optional(),
});

export const relationshipSchema = z.object({
	id: z.string().default(generateId),
	subjectId: z.string(),
	subjectType: z.string(),
	objectId: z.string(),
	objectType: z.string(),
	relationshipType: z.string(),
	attributes: z
		.record(z.string(), z.unknown())
		.or(z.string().transform((v) => JSON.parse(v)))
		.nullish()
		.optional(),
	metadata: z
		.record(z.string(), z.unknown())
		.or(z.string().transform((v) => JSON.parse(v)))
		.nullish()
		.optional(),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().nullish().optional(),
});

export const schemaDefinitionSchema = z.object({
	id: z.string().default(generateId),
	version: z.string(),
	definition: z.string(),
	isActive: z.boolean().default(true),
	metadata: z
		.record(z.string(), z.unknown())
		.or(z.string().transform((v) => JSON.parse(v)))
		.nullish()
		.optional(),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().nullish().optional(),
	createdBy: z.string().nullish().optional(),
});

export type Object = z.infer<typeof objectSchema>;
export type Relationship = z.infer<typeof relationshipSchema>;
export type SchemaDefinition = z.infer<typeof schemaDefinitionSchema>;

export type ObjectInput = z.input<typeof objectSchema>;
export type RelationshipInput = z.input<typeof relationshipSchema>;
export type SchemaDefinitionInput = z.input<typeof schemaDefinitionSchema>;

export type InferObject<
	O extends GraphOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Object & InferAdditionalFieldsFromPluginOptions<"object", O, isClientSide>
>;

export type InferRelationship<
	O extends GraphOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Relationship &
		InferAdditionalFieldsFromPluginOptions<"relationship", O, isClientSide>
>;

export type InferSchemaDefinition<
	O extends GraphOptions,
	isClientSide extends boolean = true,
> = Prettify<
	SchemaDefinition &
		InferAdditionalFieldsFromPluginOptions<"schemaDefinition", O, isClientSide>
>;
