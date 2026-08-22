import type { BetterAuthDBSchema } from "@better-auth/core/db";

export type RelationKeysByModel = ReadonlyMap<string, ReadonlySet<string>>;

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
