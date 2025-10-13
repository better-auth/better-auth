import type { BetterAuthPlugin } from "../types";
import type { CoreSchemaFields, schema } from "./schema";
import type { DBFieldAttribute } from "./type";

export type BetterAuthPluginDBSchema<B extends BetterAuthPluginDBSchema = {}> =
	{
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

// TODO: Implement
export type MergeSchema<S1, S2> = {};

export type MergePluginsSchema<
	P extends BetterAuthPlugin<any>[],
	S extends BetterAuthPluginDBSchema<typeof schema>,
> = P extends (infer Plugin)[]
	? Plugin extends BetterAuthPlugin<infer Schema>
		? MergeSchema<S, Schema>
		: never
	: never;
