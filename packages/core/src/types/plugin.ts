import type {
	Endpoint,
	EndpointContext,
	InputContext,
	Middleware,
} from "better-call";
import type { Migration } from "kysely";
import type { AuthMiddleware } from "../api";
import type { BetterAuthPluginDBSchema, Session, User } from "../db";
import type { RawError } from "../utils/error-codes";
import type { AuthContext, GenericEndpointContext } from "./context";
import type { Awaitable, LiteralString } from "./helper";
import type { BetterAuthOptions } from "./init-options";

type DeepPartial<T> = T extends Function
	? T
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T;

export type HookEndpointContext = Partial<
	EndpointContext<string, any> & Omit<InputContext<string, any>, "method">
> & {
	path?: string;
	context: AuthContext & {
		returned?: unknown | undefined;
		responseHeaders?: Headers | undefined;
	};
	headers?: Headers | undefined;
};

export type BetterAuthPluginErrorCodePart = {
	/**
	 * The error codes returned by the plugin
	 */
	$ERROR_CODES?: Record<string, RawError>;
};

export type BetterAuthPlugin = BetterAuthPluginErrorCodePart & {
	id: LiteralString;
	version?: string | undefined;
	/**
	 * The init function is called when the plugin is initialized.
	 * You can return a new context or modify the existing context.
	 */
	init?:
		| ((ctx: AuthContext) =>
				| Awaitable<{
						context?:
							| (DeepPartial<Omit<AuthContext, "options">> &
									Record<string, unknown>)
							| undefined;
						options?: Partial<BetterAuthOptions> | undefined;
				  }>
				| void
				| Promise<void>)
		| undefined;
	endpoints?:
		| {
				[key: string]: Endpoint;
		  }
		| undefined;
	middlewares?:
		| {
				path: string;
				middleware: Middleware;
		  }[]
		| undefined;
	onRequest?:
		| ((
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
		  >)
		| undefined;
	onResponse?:
		| ((
				response: Response,
				ctx: AuthContext,
		  ) => Promise<{
				response: Response;
		  } | void>)
		| undefined;
	hooks?:
		| {
				before?: {
					matcher: (context: HookEndpointContext) => boolean;
					handler: AuthMiddleware;
				}[];
				after?: {
					matcher: (context: HookEndpointContext) => boolean;
					handler: AuthMiddleware;
				}[];
		  }
		| undefined;
	/**
	 * Gate which resolved sessions Better Auth accepts. Called every time a
	 * session is resolved from the session cookie, including the cookie-cache
	 * path, before the session is refreshed or its cookies are re-issued. This
	 * covers `/get-session`, `auth.api.getSession`, and every endpoint that
	 * requires a session.
	 *
	 * Return `true` to accept the session. Any other result treats the
	 * request as unauthenticated: the session is not deleted and its cookies
	 * are left untouched. A thrown error fails the lookup: `/get-session`
	 * responds with an error and endpoints that require a session reject the
	 * request.
	 *
	 * It runs on every authenticated request, so avoid per-request I/O. Fields
	 * marked `returned: false` may be missing, so a field the check depends on
	 * must be returned. It is not called for sessions a plugin places on
	 * `ctx.context.session` itself, nor by the cookie-only helpers
	 * `getSessionCookie` and `getCookieCache`.
	 */
	validateSession?:
		| ((
				data: {
					session: Session & Record<string, unknown>;
					user: User & Record<string, unknown>;
				},
				context: GenericEndpointContext,
		  ) => Awaitable<boolean>)
		| undefined;
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
	schema?: BetterAuthPluginDBSchema | undefined;
	/**
	 * The migrations of the plugin. If you define schema that will automatically create
	 * migrations for you.
	 *
	 * ⚠️ Only uses this if you dont't want to use the schema option and you disabled migrations for
	 * the tables.
	 */
	migrations?: Record<string, Migration> | undefined;
	/**
	 * The options of the plugin
	 */
	options?: Record<string, any> | undefined;
	/**
	 * types to be inferred
	 */
	$Infer?: Record<string, any> | undefined;
	/**
	 * The rate limit rules to apply to specific paths.
	 */
	rateLimit?:
		| {
				window: number;
				max: number;
				pathMatcher: (path: string) => boolean;
		  }[]
		| undefined;
	/**
	 * All database operations that are performed by the plugin
	 *
	 * This will override the default database operations
	 */
	adapter?: {
		[key: string]: (...args: any[]) => Awaitable<any>;
	};
};
