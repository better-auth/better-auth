import type { DBFieldAttribute } from "./type";

export type BetterAuthPluginDBSchema = {
	[table in string]: {
		fields: {
			[field in string]: DBFieldAttribute;
		};
		disableMigration?: boolean;
		modelName?: string;
	};
};
