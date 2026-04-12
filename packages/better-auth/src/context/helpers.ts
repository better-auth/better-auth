import type {
	AuthContext,
	AwaitableFunction,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import { env } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import type { EndpointContext, InputContext } from "better-call";
import { defu } from "defu";
import { createCookieGetter, getCookies } from "../cookies";
import { createInternalAdapter } from "../db";
import { isPromise } from "../utils/is-promise";
import {
	getBaseURL,
	getOrigin,
	isDynamicBaseURLConfig,
	isRequestLike,
	resolveBaseURL,
} from "../utils/url";

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

	if (isDynamicBaseURLConfig(options.baseURL)) {
		const allowedHosts = options.baseURL.allowedHosts;
		for (const host of allowedHosts) {
			if (!host.includes("://")) {
				trustedOrigins.push(`https://${host}`);
				if (host.includes("localhost") || host.includes("127.0.0.1")) {
					trustedOrigins.push(`http://${host}`);
				}
			} else {
				trustedOrigins.push(host);
			}
		}

		if (options.baseURL.fallback) {
			try {
				trustedOrigins.push(new URL(options.baseURL.fallback).origin);
			} catch {}
		}
	} else {
		const baseURL = getBaseURL(
			typeof options.baseURL === "string" ? options.baseURL : undefined,
			options.basePath,
			request,
		);
		if (baseURL) {
			trustedOrigins.push(new URL(baseURL).origin);
		}
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

	const headers = new Headers(input.headers);
	if (!headers.has("host") && !headers.has("x-forwarded-host")) {
		return undefined;
	}
	return headers;
}

/**
 * Wraps a `Headers` value as a `Request` so `trustedOrigins(req)` callbacks
 * can always read `req.headers`. Returns the original `Request` unchanged.
 */
function sourceAsRequest(
	source: Request | Headers | undefined,
	fallbackURL: string,
): Request | undefined {
	if (!source) return undefined;
	if (isRequestLike(source)) return source;
	return new Request(fallbackURL, { headers: source });
}

/**
 * Per-request clone with `baseURL`, `trustedOrigins` and cookies rehydrated
 * for the resolved host. Throws `BetterAuthError` when the URL cannot be
 * resolved; callers on the direct-API path convert this to `APIError`.
 */
export async function resolveRequestContext(
	ctx: AuthContext,
	source?: Request | Headers,
	trustedProxyHeaders?: boolean,
): Promise<AuthContext> {
	const dynamicBaseURLConfig = ctx.options.baseURL;
	const basePath = ctx.options.basePath || "/api/auth";
	const baseURL = resolveBaseURL(
		dynamicBaseURLConfig,
		basePath,
		source,
		undefined,
		trustedProxyHeaders,
	);
	if (!baseURL) {
		throw new BetterAuthError(
			"Could not resolve base URL from request. Check your allowedHosts config.",
		);
	}

	const resolved = Object.create(
		Object.getPrototypeOf(ctx),
		Object.getOwnPropertyDescriptors(ctx),
	) as AuthContext;
	resolved.baseURL = baseURL;
	resolved.options = {
		...ctx.options,
		baseURL: getOrigin(baseURL) || undefined,
	};

	// Pass the dynamic config so getTrustedOrigins can expand `allowedHosts`.
	const trustedOriginOptions: BetterAuthOptions = {
		...resolved.options,
		baseURL: dynamicBaseURLConfig,
	};
	resolved.trustedOrigins = await getTrustedOrigins(
		trustedOriginOptions,
		sourceAsRequest(source, baseURL),
	);

	if (ctx.options.advanced?.crossSubDomainCookies?.enabled) {
		resolved.authCookies = getCookies(resolved.options);
		resolved.createAuthCookie = createCookieGetter(resolved.options);
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
