import type { DBFieldAttribute } from "./type";

export type BetterAuthPluginDBSchema = {
	[table in string]: BetterAuthPluginDBTableSchema;
};

export type BetterAuthPluginDBTableSchema = {
	fields: {
		[field in string]: DBFieldAttribute;
	};
	disableMigration?: boolean;
	modelName?: string;
};
