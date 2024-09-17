import {
	getAuthTables,
	type BetterAuthDbSchema,
} from "../../adapters/get-tables";
import type { FieldAttribute } from "../../db";
import type { BetterAuthOptions } from "../../types";

export function getPluginTable(config: BetterAuthOptions) {
	const pluginsMigrations =
		config.plugins?.flatMap((plugin) =>
			Object.keys(plugin.schema || {})
				.map((key) => {
					const schema = plugin.schema || {};
					const table = schema[key]!;
					if (table?.disableMigration) {
						return;
					}
					return {
						tableName: key,
						fields: table?.fields as Record<string, FieldAttribute>,
					};
				})
				.filter((value) => value !== undefined),
		) || [];
	return pluginsMigrations;
}
export function getSchema(config: BetterAuthOptions) {
	const baseSchema = getAuthTables(config);
	const pluginSchema = getPluginTable(config);
	const schema = [
		baseSchema.user,
		baseSchema.session,
		baseSchema.account,
		...pluginSchema,
	].reduce((acc, curr) => {
		//@ts-expect-error
		acc[curr.tableName] = {
			fields: {
				...acc[curr.tableName]?.fields,
				...curr.fields,
			},
		};
		return acc;
	}, {} as BetterAuthDbSchema);
	return schema;
}
