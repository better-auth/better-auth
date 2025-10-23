import type { DBFieldAttribute } from "./type";

export interface BetterAuthPluginDBSchemaFields {
	[field: string]: DBFieldAttribute;
}

export type BetterAuthPluginDBSchema = {
	[table in string]: {
		fields: {
			[field: string]: DBFieldAttribute;
		};
		disableMigration?: boolean;
		modelName?: string;
	};
};
