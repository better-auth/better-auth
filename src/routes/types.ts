import type { cookieManager } from "../cookies";
import type { InternalOptions } from "../options";
import type { AfterHookHandler, BeforeHookHandler } from "../plugins/types";

export type InternalRequest<T, Q> = {
	cookies: ReturnType<typeof cookieManager>;
	method: string;
	body: T;
	query: Q;
	headers: Headers;
	url: URL;
	action: Omit<string, BetterAuthActions> | BetterAuthActions;
};

type Body = Record<string, any> | string | null;

export type InternalResponse<T extends Body = any> = {
	status: number;
	statusText?: string;
	body?: T;
	headers?: Record<string, any>;
	/**
	 * Metadata for use in plugins.
	 */
	metadata?: {
		isError?: boolean;
	};
};

export type Context<B = any, Q = any> = {
	request: InternalRequest<B, Q>;
} & InternalOptions;

export type GenericHandler<
	T = any,
	R extends Body = any,
	C extends Context = Context,
> = (ctx: Context<T> & C) => Promise<InternalResponse<R>>;

export type BetterAuthActions =
	| "signin"
	| "signup"
	| "signout"
	| "callback"
	| "session";

export interface HandlerHooks {
	/**
	 * A matcher. A hook will be added to an action if the
	 * matcher returns true.
	 */
	matcher: (context: Context) => boolean;
	/**
	 * A function that gets executed either before
	 * the main function. If the function returns a result,
	 * that result will be the output of the main function.
	 * If the function returns context, that context will be
	 * passed to the main function. If the function returns
	 * null or undefined, the main function will be executed
	 * with the original context.
	 */
	before?: BeforeHookHandler;
	/**
	 * A function that gets executed after the main function.
	 * If the function returns a result, that result will be
	 * the output of the main function.
	 * If the function returns context, that context will be
	 * passed to the main function. If the function returns
	 * null or undefined, the main function will be executed
	 * with the original context.
	 */
	after?: AfterHookHandler;
}

export interface CookieOptions {
	expires?: Date;
	maxAge?: number;
	domain?: string;
	path?: string;
	secure?: boolean;
	httpOnly?: boolean;
	sameSite?: string;
}
