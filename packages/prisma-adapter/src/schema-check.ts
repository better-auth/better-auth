import type { BetterAuthOptions } from "@better-auth/core";
import type {
	IntrospectedTable,
	SchemaFinding,
} from "@better-auth/core/db/internal";
import { diffSchema, getExpectedSchema } from "@better-auth/core/db/internal";

/**
 * The part of a generated client's data model the comparison reads.
 */
export interface PrismaRuntimeDataModel {
	models: Record<
		string,
		{
			fields: readonly {
				name: string;
				kind: "scalar" | "object" | "enum" | "unsupported";
				isRequired: boolean;
				hasDefaultValue: boolean;
				isUpdatedAt?: boolean | undefined;
			}[];
		}
	>;
}

/**
 * The data model a generated client carries, or nothing for a client that
 * predates it or stands in for one.
 */
export function readPrismaDataModel(
	client: object,
): PrismaRuntimeDataModel | undefined {
	const dataModel = (client as { _runtimeDataModel?: unknown })
		._runtimeDataModel;
	return typeof dataModel === "object" &&
		dataModel !== null &&
		"models" in dataModel
		? (dataModel as PrismaRuntimeDataModel)
		: undefined;
}

/**
 * Prisma exposes the model `Account` as `prisma.account`.
 */
function clientProperty(model: string): string {
	return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Reads a generated client's data model the way the adapter addresses it:
 * each model by its client property, each field by name. Relation fields are
 * not columns and are skipped.
 */
export function introspectPrismaDataModel(
	dataModel: PrismaRuntimeDataModel,
): IntrospectedTable[] {
	return Object.entries(dataModel.models).map(([model, { fields }]) => ({
		name: clientProperty(model),
		columns: fields
			.filter((field) => field.kind !== "object")
			.map((field) => ({
				name: field.name,
				nullable: !field.isRequired,
				hasDefault: field.hasDefaultValue || field.isUpdatedAt === true,
			})),
	}));
}

/**
 * Compares a generated client's data model with the tables this configuration writes.
 */
export function findPrismaSchemaProblems(
	dataModel: PrismaRuntimeDataModel,
	options: BetterAuthOptions,
	usePlural?: boolean | undefined,
): SchemaFinding[] {
	return diffSchema(
		getExpectedSchema(options, { usePlural }),
		introspectPrismaDataModel(dataModel),
	);
}
