import type { BetterAuthDBSchema } from "@better-auth/core/db";

export type RelationKeysByModel = ReadonlyMap<string, ReadonlySet<string>>;

export type DrizzleRelationRegistry = Readonly<
	Record<
		string,
		{
			readonly relations?: Readonly<Record<string, unknown>> | undefined;
		}
	>
>;

/**
 * Reads the relation registry used to build Drizzle relational queries.
 *
 * - Drizzle 0.x (Relations v1): `db._.schema`
 * - Drizzle 1.x (Relations v2): `db._.relations`
 */
export function buildRelationKeysByModel(
	relationRegistry: DrizzleRelationRegistry | undefined,
): RelationKeysByModel {
	const relationKeysByModel = new Map<string, ReadonlySet<string>>();
	for (const [model, tableMetadata] of Object.entries(relationRegistry ?? {})) {
		if (!tableMetadata.relations) continue;
		relationKeysByModel.set(
			model,
			new Set(Object.keys(tableMetadata.relations)),
		);
	}
	return relationKeysByModel;
}

export function getOneToOneRelationKey({
	baseModel,
	joinModel,
	relationKeys,
	schema,
	getDefaultModelName,
}: {
	baseModel: string;
	joinModel: string;
	relationKeys: ReadonlySet<string> | undefined;
	schema: BetterAuthDBSchema;
	getDefaultModelName: (model: string) => string;
}) {
	const defaultBaseModelName = getDefaultModelName(baseModel);
	const defaultJoinModelName = getDefaultModelName(joinModel);
	const joinModelFields = schema[defaultJoinModelName]?.fields ?? {};
	// Keep this direction check aligned with transformJoinClause and the
	// forward/reverse naming in both Drizzle schema generators.
	const joinModelReferencesBase = Object.values(joinModelFields).some(
		(field) =>
			field.references &&
			getDefaultModelName(field.references.model) === defaultBaseModelName,
	);
	const generatedRelationKey = joinModelReferencesBase
		? joinModel
		: (schema[defaultJoinModelName]?.modelName ?? defaultJoinModelName);

	if (!relationKeys?.size) return joinModel;
	if (relationKeys.has(generatedRelationKey)) return generatedRelationKey;
	if (relationKeys.has(joinModel)) return joinModel;
	return generatedRelationKey;
}
