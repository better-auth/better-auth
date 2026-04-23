import type { DBFieldAttribute } from "./type.js";

export type BetterAuthPluginDBSchema = {
	[table in string]: {
		fields: {
			[field: string]: DBFieldAttribute;
		};
		disableMigration?: boolean | undefined;
		modelName?: string | undefined;
	};
};
