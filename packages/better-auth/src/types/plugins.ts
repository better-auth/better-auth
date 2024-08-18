import { Migration } from "kysely";
import { AuthEndpoint } from "../api/call";
import { FieldAttribute } from "../db/field";
import { LiteralString } from "./helper";

export type PluginSchema = {
	[table: string]: {
		fields: {
			[field in string]: FieldAttribute;
		};
		disableMigration?: boolean;
	};
};

export type Plugin = {
	id: LiteralString;
	endpoints: {
		[key: string]: AuthEndpoint;
	};
	/**
	 * Schema the plugin needs
	 *
	 * This will also be used to migrate the database. If the fields are dynamic from the plugins
	 * configuration each time the configuration is changed a new migration will be created.
	 *
	 * NOTE: If you want to create migrations manually using
	 * migrations option or any other way you
	 * can disable migration per table basis.
	 *
	 * @example
	 * ```ts
	 * schema: {
	 * 	user: {
	 * 		fields: {
	 * 			email: {
	 * 				 type: "string",
	 * 			},
	 * 			emailVerified: {
	 * 				type: "boolean",
	 * 				defaultValue: false,
	 * 			},
	 * 		},
	 * 	}
	 * } as PluginSchema
	 * ```
	 */
	schema?: PluginSchema;
	/**
	 * The migrations of the plugin. If you define schema that will automatically create
	 * migrations for you.
	 *
	 * ⚠️ Only uses this if you dont't want to use the schema option and you disabled migrations for
	 * the tables.
	 */
	migrations?: Record<string, Migration>;
};
