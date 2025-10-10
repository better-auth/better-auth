import type { Migration } from "kysely";
import type { AuthContext } from "./context";
import type {
	Endpoint,
	EndpointContext,
	InputContext,
	Middleware,
} from "better-call";
import type { BetterAuthPluginDBSchema } from "../db";
import type { LiteralString } from "./helper";
import type { BetterAuthOptions } from "./init-options";
import type { AuthMiddleware } from "../middleware";
import type { schema } from "../db/schema";

type Awaitable<T> = T | Promise<T>;
type DeepPartial<T> = T extends Function
	? T
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T;

type HookEndpointContext<Schema extends BetterAuthPluginDBSchema<typeof schema>> =
	Omit<InputContext<string, any>, "method"> & {
		context: AuthContext<Schema> & {
			returned?: unknown;
			responseHeaders?: Headers;
		};
		headers?: Headers;
	};

export type BetterAuthPlugin<Schema extends BetterAuthPluginDBSchema<typeof schema>> =
		{
			id: LiteralString;
			/**
			 * The init function is called when the plugin is initialized.
			 * You can return a new context or modify the existing context.
			 */
			init?: (ctx: AuthContext<Schema>) =>
				| Awaitable<{
						context?: DeepPartial<Omit<AuthContext<Schema>, "options">>;
						options?: Partial<BetterAuthOptions<Schema>>;
				  }>
				| void
				| Promise<void>;
			endpoints?: {
				[key: string]: Endpoint;
			};
			middlewares?: {
				path: string;
				middleware: Middleware;
			}[];
			onRequest?: (
				request: Request,
				ctx: AuthContext<Schema>,
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
				ctx: AuthContext<Schema>,
			) => Promise<{
				response: Response;
			} | void>;
			hooks?: {
				before?: {
					matcher: (context: HookEndpointContext<typeof schema>) => boolean;
					handler: AuthMiddleware;
				}[];
				after?: {
					matcher: (context: HookEndpointContext<typeof schema>) => boolean;
					handler: AuthMiddleware;
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
			 * } as AuthPluginSchema
			 * ```
			 */
			schema?: Schema;
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
			options?: Record<string, any> | undefined;
			/**
			 * types to be inferred
			 */
			$Infer?: Record<string, any>;
			/**
			 * The rate limit rules to apply to specific paths.
			 */
			rateLimit?: {
				window: number;
				max: number;
				pathMatcher: (path: string) => boolean;
			}[];
			/**
			 * The error codes returned by the plugin
			 */
			$ERROR_CODES?: Record<string, string>;
		};
