import type {
	AuthContext,
	AwaitableFunction,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import { env } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { isLoopbackHost } from "@better-auth/core/utils/host";
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
		const proto = options.baseURL.protocol;
		for (const host of allowedHosts) {
			if (!host.includes("://")) {
				if (!proto || proto === "https" || proto === "auto") {
					trustedOrigins.push(`https://${host}`);
				}
				if (proto === "http" || proto === "auto" || isLoopbackHost(host)) {
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
 * Returns the effective `trustedProxyHeaders` value for dynamic `baseURL`
 * resolution. When the user hasn't set `advanced.trustedProxyHeaders`,
 * proxy headers (`x-forwarded-host` / `x-forwarded-proto`) are trusted by
 * default so deployments behind a reverse proxy work without extra config.
 */
export function resolveDynamicTrustedProxyHeaders(
	options: BetterAuthOptions,
): boolean {
	return options.advanced?.trustedProxyHeaders ?? true;
}

/**
 * Resolves the per-request {@link AuthContext} for any baseURL config, overlaying
 * the request-varying slice onto a clone without mutating the shared context.
 * Throws for an unresolvable dynamic host; returns the shared context unchanged
 * for a static no-baseURL config with no request.
 */
export async function resolveRequestContext(
	ctx: AuthContext,
	source?: Request | Headers,
): Promise<AuthContext> {
	const config = ctx.options.baseURL;
	const isDynamic = isDynamicBaseURLConfig(config);
	const hasRequestDependentTrust =
		typeof ctx.options.trustedOrigins === "function" ||
		typeof ctx.options.account?.accountLinking?.trustedProviders === "function";
	// Already resolved at init and nothing varies per request.
	if (!isDynamic && !hasRequestDependentTrust && ctx.baseURL) {
		return ctx;
	}

	const basePath = ctx.options.basePath || "/api/auth";
	// Dynamic validates the host itself, so proxy headers default to trusted;
	// static keeps the user's setting to avoid trusting a spoofable host.
	const trustedProxyHeaders = isDynamic
		? resolveDynamicTrustedProxyHeaders(ctx.options)
		: ctx.options.advanced?.trustedProxyHeaders;
	const baseURL = resolveBaseURL(
		config,
		basePath,
		source,
		undefined,
		trustedProxyHeaders,
	);
	if (!baseURL) {
		if (isDynamic) {
			throw new BetterAuthError(
				"Could not resolve base URL from request. Check your allowedHosts config.",
			);
		}
		return ctx;
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

	// Dynamic needs the config for `allowedHosts` expansion; static already has
	// the resolved origin in `resolved.options.baseURL`.
	const trustedOriginOptions: BetterAuthOptions = isDynamic
		? { ...resolved.options, baseURL: config }
		: resolved.options;
	// Only synthesize a Request for the user-facing callbacks that need one.
	const callbackRequest: Request | undefined = !hasRequestDependentTrust
		? undefined
		: isRequestLike(source)
			? source
			: source
				? new Request(baseURL, { headers: source })
				: undefined;
	resolved.trustedOrigins = await getTrustedOrigins(
		trustedOriginOptions,
		callbackRequest,
	);
	resolved.trustedProviders = await getTrustedProviders(
		resolved.options,
		callbackRequest,
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
