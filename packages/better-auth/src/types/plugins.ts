import type { Endpoint, EndpointResponse } from "better-call";
import type { Migration } from "kysely";
import type { AuthEndpoint } from "../api/call";
import type { FieldAttribute } from "../db/field";
import type { GenericEndpointContext } from "./context";
import type { LiteralString } from "./helper";

export type PluginSchema = {
	[table: string]: {
		fields: {
			[field in string]: FieldAttribute;
		};
		disableMigration?: boolean;
	};
};

export type BetterAuthPlugin = {
	id: LiteralString;
	endpoints?: {
		[key: string]: AuthEndpoint;
	};
	middlewares?: {
		path: string;
		middleware: Endpoint;
	}[];
	hooks?: {
		before?: {
			matcher: (context: GenericEndpointContext) => boolean;
			handler: (context: GenericEndpointContext) => Promise<void | {
				context: Partial<GenericEndpointContext>;
			}>;
		}[];
		after?: {
			matcher: (context: GenericEndpointContext) => boolean;
			handler: (
				context: GenericEndpointContext & {
					returned: EndpointResponse;
				},
			) => Promise<void | {
				response: EndpointResponse;
			}>;
		}[];
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
	/**
	 * The options of the plugin
	 */
	options?: Record<string, any>;
};
