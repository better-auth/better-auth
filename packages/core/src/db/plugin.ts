import type { DBFieldAttribute } from "./type.js";

export type BetterAuthPluginDBSchema = {
	[table in string]: {
		fields: {
			[field in string]: DBFieldAttribute;
		};
		disableMigration?: boolean;
		modelName?: string;
	};
};
