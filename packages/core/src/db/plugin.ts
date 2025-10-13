import type { CoreSchemaFields } from "./schema";
import type { DBFieldAttribute } from "./type";

export type BetterAuthPluginDBSchema<B extends BetterAuthPluginDBSchema = {}> = {
	[table in string]: BetterAuthPluginDBTableSchema;
} & {
	[t in keyof B]: BetterAuthPluginDBTableSchema;
};



export type BetterAuthPluginDBTableSchema = {
	fields: {
		[field in string]: DBFieldAttribute;
	} & {
		[core in CoreSchemaFields]: DBFieldAttribute;
	};
	disableMigration?: boolean;
	modelName?: string;
};
