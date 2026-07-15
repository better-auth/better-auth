import type { BetterAuthDBSchema } from "./type";

/** A direct child field whose schema requires deletion with its parent. */
export type DirectCascadeDeleteReference = Readonly<{
	/** Logical child model name used by Better Auth adapters. */
	model: string;
	/** Logical child field that references the parent. */
	field: string;
	/** Logical field on the parent selected by the reference. */
	referencedField: string;
}>;

/**
 * Resolve direct schema references that declare cascade deletion for a parent.
 *
 * The schema is the lifecycle contract for every adapter, including stores
 * that do not enforce foreign keys. `onDelete` defaults to `cascade` in the
 * schema contract, so omitted actions are included. Model aliases are resolved
 * in both directions so plugin schemas can reference either the logical key or
 * the configured database model name.
 *
 * @internal
 */
export function getDirectCascadeDeleteReferences(
	schema: BetterAuthDBSchema,
	parentModel: string,
): DirectCascadeDeleteReference[] {
	const parentEntry = Object.entries(schema).find(
		([schemaKey, table]) =>
			schemaKey === parentModel || table.modelName === parentModel,
	);
	if (!parentEntry) return [];

	const [parentSchemaKey, parentTable] = parentEntry;
	const parentModelNames = new Set([
		parentModel,
		parentSchemaKey,
		parentTable.modelName,
	]);
	const references: DirectCascadeDeleteReference[] = [];
	const seenReferences = new Set<string>();

	for (const [model, table] of Object.entries(schema)) {
		for (const [field, attribute] of Object.entries(table.fields)) {
			const reference = attribute.references;
			if (!reference || !parentModelNames.has(reference.model)) continue;
			if ((reference.onDelete ?? "cascade") !== "cascade") continue;

			const referenceKey = `${model}\0${field}\0${reference.field}`;
			if (seenReferences.has(referenceKey)) continue;
			seenReferences.add(referenceKey);
			references.push({
				model,
				field,
				referencedField: reference.field,
			});
		}
	}

	return references;
}
