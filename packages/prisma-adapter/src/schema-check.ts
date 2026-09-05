import type { BetterAuthOptions } from "@better-auth/core";
import type {
	IntrospectedTable,
	SchemaFinding,
} from "@better-auth/core/db/internal";
import { diffSchema, getExpectedSchema } from "@better-auth/core/db/internal";

/**
 * The part of a generated client's data model the comparison reads. The
 * `prisma-client` generator emits a compact model that carries names and
 * kinds but no nullability or default, so those fields are optional.
 */
export interface PrismaRuntimeDataModel {
	models: Record<
		string,
		{
			fields: readonly {
				name: string;
				kind: "scalar" | "object" | "enum" | "unsupported";
				isRequired?: boolean | undefined;
				hasDefaultValue?: boolean | undefined;
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
 * not columns and are skipped. A field whose model does not say whether it
 * is required is taken as one an insert may omit, so a compact model reports
 * missing tables and columns but never a required column.
 */
function introspectPrismaDataModel(
	dataModel: PrismaRuntimeDataModel,
): IntrospectedTable[] {
	return Object.entries(dataModel.models).map(([model, { fields }]) => ({
		name: clientProperty(model),
		columns: fields
			.filter((field) => field.kind !== "object")
			.map((field) => ({
				name: field.name,
				nullable: field.isRequired !== true,
				hasDefault:
					field.hasDefaultValue === true || field.isUpdatedAt === true,
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
