import type {
	AuthContext,
	AwaitableFunction,
	BetterAuthOptions,
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import { env } from "@better-auth/core/env";
import type { EndpointContext, InputContext } from "better-call";
import { defu } from "defu";
import { createCookieGetter, getCookies } from "../cookies";
import { createInternalAdapter } from "../db";
import { isPromise } from "../utils/is-promise";
import {
	getBaseURL,
	getRequestOrigin,
	isRequestLike,
	withPath,
} from "../utils/url";

/** Marks an `AuthContext` clone as already resolved for the current request, so
 * the HTTP handler and the router's endpoint dispatch don't resolve it twice. */
const PER_REQUEST_RESOLVED: unique symbol = Symbol(
	"better-auth.perRequestResolved",
);

export async function runPluginInit(context: AuthContext) {
	let options = context.options;
	const plugins = options.plugins || [];
	const pluginTrustedOrigins: NonNullable<
		BetterAuthOptions["trustedOrigins"]
	>[] = [];
	const dbHooks: {
		source: string;
		hooks: Exclude<BetterAuthOptions["databaseHooks"], undefined>;
	}[] = [];
	for (const plugin of plugins) {
		if (plugin.init) {
			const initPromise = plugin.init(context);
			let result: ReturnType<Required<BetterAuthPlugin>["init"]>;
			if (isPromise(initPromise)) {
				result = await initPromise;
			} else {
				result = initPromise;
			}
			if (typeof result === "object") {
				if (result.options) {
					const { databaseHooks, trustedOrigins, ...restOpts } = result.options;
					if (databaseHooks) {
						dbHooks.push({
							source: `plugin:${plugin.id}`,
							hooks: databaseHooks,
						});
					}
					if (trustedOrigins) {
						pluginTrustedOrigins.push(trustedOrigins);
					}
					options = defu(options, restOpts);
				}
				if (result.context) {
					// Use Object.assign to keep the reference to the original context
					Object.assign(context, result.context);
				}
			}
		}
	}
	if (pluginTrustedOrigins.length > 0) {
		const allSources = [
			...(options.trustedOrigins ? [options.trustedOrigins] : []),
			...pluginTrustedOrigins,
		];
		const staticOrigins = allSources.filter(Array.isArray).flat();
		const dynamicOrigins = allSources.filter(
			(s): s is Exclude<typeof s, string[]> => typeof s === "function",
		);
		if (dynamicOrigins.length > 0) {
			options.trustedOrigins = async (request) => {
				const resolved = await Promise.all(
					dynamicOrigins.map((fn) => fn(request)),
				);
				return [...staticOrigins, ...resolved.flat()].filter(
					(v): v is string => typeof v === "string" && v !== "",
				);
			};
		} else {
			options.trustedOrigins = staticOrigins;
		}
	}

	// Add the global database hooks last
	if (options.databaseHooks) {
		dbHooks.push({ source: "user", hooks: options.databaseHooks });
	}

	context.internalAdapter = createInternalAdapter(context.adapter, {
		options,
		logger: context.logger,
		hooks: dbHooks,
		generateId: context.generateId,
	});
	context.options = options;
}

export function getInternalPlugins(options: BetterAuthOptions) {
	const plugins: BetterAuthPlugin[] = [];
	if (options.advanced?.crossSubDomainCookies?.enabled) {
		// TODO: add internal plugin
	}
	return plugins;
}

export async function getTrustedOrigins(
	options: BetterAuthOptions,
	request?: Request,
): Promise<string[]> {
	const trustedOrigins: (string | undefined | null)[] = [];

	const baseURL = getBaseURL(options.baseURL, options.basePath, request);
	if (baseURL) {
		trustedOrigins.push(new URL(baseURL).origin);
	}

	if (options.trustedOrigins) {
		if (Array.isArray(options.trustedOrigins)) {
			trustedOrigins.push(...options.trustedOrigins);
		}
		if (typeof options.trustedOrigins === "function") {
			const validOrigins = await options.trustedOrigins(request);
			trustedOrigins.push(...validOrigins);
		}
	}
	const envTrustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS;
	if (envTrustedOrigins) {
		trustedOrigins.push(...envTrustedOrigins.split(","));
	}
	return trustedOrigins.filter((v): v is string => Boolean(v));
}

/**
 * Input shape accepted by every `auth.api.*` endpoint invocation.
 */
type EndpointInput = Partial<
	InputContext<string, any> & EndpointContext<string, any>
>;

/**
 * Picks a `Request`-like or `Headers` value from a direct `auth.api` call.
 * Headers are only accepted when they carry a host: without one, host
 * resolution would fall back to `null` and the caller should use `fallback`
 * or pass a `Request` instead.
 */
export function pickSource(
	input: EndpointInput | undefined,
): Request | Headers | undefined {
	if (isRequestLike(input?.request)) return input.request;
	if (!input?.headers) return undefined;

	const headers =
		input.headers instanceof Headers
			? input.headers
			: new Headers(input.headers);
	if (!headers.has("host") && !headers.has("x-forwarded-host")) {
		return undefined;
	}
	return headers;
}

/**
 * Whether `x-forwarded-host` / `x-forwarded-proto` may be used to determine the
 * origin a request arrived on. Defaults to `false` so a spoofed `Host` cannot
 * be honored unless the deployment opts in with `advanced.trustedProxyHeaders`,
 * which a reverse proxy that exposes the public host via `x-forwarded-host`
 * must set.
 */
function shouldTrustProxyHeaders(options: BetterAuthOptions): boolean {
	return options.advanced?.trustedProxyHeaders ?? false;
}

/**
 * The base URL for self-referential links and cookies on this request:
 * the origin the request arrived on when it is a trusted origin, otherwise the
 * canonical {@link AuthContext.baseURL}. Identity-bearing values
 * (issuer, `redirect_uri`, Passkey rp id) deliberately do NOT use this; they
 * read the canonical `baseURL` so they stay stable across hosts.
 */
function resolveServingBaseURL(
	context: AuthContext,
	source: Request | Headers | undefined,
): string {
	if (!source) {
		return context.baseURL;
	}
	const origin = getRequestOrigin(
		source,
		undefined,
		shouldTrustProxyHeaders(context.options),
	);
	if (origin && context.isTrustedOrigin(origin)) {
		return withPath(origin, context.options.basePath || "/api/auth");
	}
	return context.baseURL;
}

/**
 * Serving base URL for the current endpoint request. See
 * {@link resolveServingBaseURL}. Use this when building links and redirects
 * that should return to the host the user is actually on (email verification,
 * magic links, password reset, OAuth callback relay).
 *
 * Returns the canonical {@link AuthContext.baseURL} (possibly empty when no
 * `baseURL`/env is configured and the request carries no origin), mirroring the
 * long-standing no-baseURL behavior rather than throwing, so a hook that reads
 * it on a request that does not build a URL is never broken.
 */
export function getRequestBaseURL(ctx: GenericEndpointContext): string {
	// Only trust a genuine `Request` for the URL fallback; a Node
	// IncomingMessage-shaped object would crash `headers.get`.
	const source = isRequestLike(ctx.request) ? ctx.request : ctx.headers;
	return resolveServingBaseURL(ctx.context, source);
}

/**
 * True when any request-derived context value can change between requests and
 * therefore must be resolved per request rather than reused from init:
 * a request-derived canonical origin (no `baseURL`/env set), or a function
 * `trustedOrigins`/`trustedProviders`.
 */
function needsRequestResolution(options: BetterAuthOptions): boolean {
	return (
		!options.baseURL ||
		typeof options.trustedOrigins === "function" ||
		typeof options.account?.accountLinking?.trustedProviders === "function"
	);
}

/**
 * Returns a per-request `AuthContext` clone with request-derived state resolved
 * for this request: the canonical `baseURL` when none is configured, the
 * `trustedOrigins`/`trustedProviders` sets, and the cross-subdomain cookie
 * domain. The clone always happens so a request-flow plugin that writes to
 * `ctx.context` (e.g. OAuth Proxy retargeting `baseURL`) can never leak onto the
 * shared context under concurrent requests. The async re-resolution is skipped
 * when nothing varies between requests, and entirely when there is no request
 * to resolve against (a direct `auth.api` call without `headers`/`request`):
 * a request-less call cannot change a request-derived value, so the init-time
 * values carried on the clone are already correct.
 */
export async function resolvePerRequestContext(
	ctx: AuthContext,
	source: Request | Headers | undefined,
): Promise<AuthContext> {
	// The HTTP handler resolves once, then dispatches through the router, which
	// re-binds the endpoints to this same context; without this guard the
	// endpoint pass would resolve (and re-invoke function `trustedOrigins`/
	// `trustedProviders`) a second time for the one request.
	if ((ctx as Record<symbol, unknown>)[PER_REQUEST_RESOLVED]) {
		return ctx;
	}
	const options = ctx.options;
	const resolved = Object.create(
		Object.getPrototypeOf(ctx),
		Object.getOwnPropertyDescriptors(ctx),
	) as AuthContext;
	Object.defineProperty(resolved, PER_REQUEST_RESOLVED, { value: true });

	if (!source) {
		return resolved;
	}

	if (needsRequestResolution(options)) {
		// No baseURL/env configured: anchor the canonical origin to this request
		// so the first request's host isn't memoized onto the shared context.
		if (!options.baseURL) {
			const origin = getRequestOrigin(
				source,
				undefined,
				shouldTrustProxyHeaders(options),
			);
			if (origin) {
				resolved.baseURL = withPath(origin, options.basePath || "/api/auth");
				resolved.options = { ...options, baseURL: origin };
			}
		}

		// Function `trustedOrigins`/`trustedProviders` read the live request.
		const callbackRequest = isRequestLike(source)
			? source
			: new Request(resolved.baseURL || "http://localhost", {
					headers: source,
				});
		resolved.trustedOrigins = await getTrustedOrigins(
			resolved.options,
			callbackRequest,
		);
		resolved.trustedProviders = await getTrustedProviders(
			resolved.options,
			callbackRequest,
		);
	}

	// Cross-subdomain cookie domain follows the serving host when not pinned.
	if (
		options.advanced?.crossSubDomainCookies?.enabled &&
		!options.advanced.crossSubDomainCookies.domain
	) {
		const servingBaseURL = resolveServingBaseURL(resolved, source);
		resolved.authCookies = getCookies(resolved.options, servingBaseURL);
		resolved.createAuthCookie = createCookieGetter(
			resolved.options,
			servingBaseURL,
		);
	}

	return resolved;
}

export async function getAwaitableValue<T extends Record<string, any>>(
	arr: AwaitableFunction<T>[] | undefined,
	item: { field?: string; value: string },
): Promise<T | undefined> {
	if (!arr) return undefined;
	for (const val of arr) {
		const value = typeof val === "function" ? await val() : val;
		if (value[item.field ?? "id"] === item.value) {
			return value;
		}
	}
	return undefined;
}

export async function getTrustedProviders(
	options: BetterAuthOptions,
	request?: Request,
): Promise<string[]> {
	const trustedProviders = options.account?.accountLinking?.trustedProviders;
	if (!trustedProviders) {
		return [];
	}
	if (Array.isArray(trustedProviders)) {
		return trustedProviders.filter((v): v is string => Boolean(v));
	}
	const resolved = await trustedProviders(request);
	return (resolved ?? []).filter((v): v is string => Boolean(v));
}
