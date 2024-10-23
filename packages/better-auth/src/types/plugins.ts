import type { Endpoint, EndpointResponse } from "better-call";
import type { Migration } from "kysely";
import type { AuthEndpoint } from "../api/call";
import type { FieldAttribute } from "../db/field";
import type { HookEndpointContext } from "./context";
import type { DeepPartial, LiteralString } from "./helper";
import type { Adapter, AuthContext, BetterAuthOptions } from ".";

export type PluginSchema = {
	[table in string]: {
		fields: {
			[field in string]: FieldAttribute;
		};
		disableMigration?: boolean;
		tableName?: string;
	};
};

export type BetterAuthPlugin = {
	id: LiteralString;
	/**
	 * The init function is called when the plugin is initialized.
	 * You can return a new context or modify the existing context.
	 */
	init?: (ctx: AuthContext) => {
		context?: DeepPartial<Omit<AuthContext, "options">>;
		options?: Partial<BetterAuthOptions>;
	} | void;
	endpoints?: {
		[key: string]: AuthEndpoint;
	};
	middlewares?: {
		path: string;
		middleware: Endpoint;
	}[];
	onRequest?: (
		request: Request,
		ctx: AuthContext,
	) => Promise<
		| {
				response: Response;
		  }
		| {
				request: Request;
		  }
		| void
	>;
	onResponse?: (
		response: Response,
		ctx: AuthContext,
	) => Promise<{
		response: Response;
	} | void>;
	hooks?: {
		before?: {
			matcher: (context: HookEndpointContext) => boolean;
			handler: (context: HookEndpointContext) => Promise<void | {
				context: Partial<HookEndpointContext>;
			}>;
		}[];
		after?: {
			matcher: (context: HookEndpointContext) => boolean;
			handler: (
				context: HookEndpointContext<{
					returned: EndpointResponse;
				}>,
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
	$Infer?: Record<string, any>;
	/**
	 * The rate limit rules to apply to specific paths.
	 */
	rateLimit?: {
		window: number;
		max: number;
		pathMatcher: (path: string) => boolean;
	}[];
};
