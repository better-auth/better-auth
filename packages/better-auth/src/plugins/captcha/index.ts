import type { BetterAuthPlugin } from "@better-auth/core";
import { getIP } from "@better-auth/core/utils/ip";
import { middlewareResponse } from "../../utils/middleware-response";
import { wildcardMatch } from "../../utils/wildcard";
import { PACKAGE_VERSION } from "../../version";
import {
	authPathPrefixes,
	defaultEndpoints,
	Providers,
	siteVerifyMap,
} from "./constants";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "./error-codes";
import type { CaptchaOptions } from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		captcha: {
			creator: typeof captcha;
		};
	}
}

import * as verifyHandlers from "./verify-handlers";

export type * from "./types";

const normalizeEndpointPath = (pathname: string, basePath: string) => {
	const pathWithoutBase = pathname.startsWith(basePath)
		? pathname.slice(basePath.length)
		: pathname;
	let normalizedPathname = pathWithoutBase.replace(/\/{2,}/g, "/");
	if (!normalizedPathname.startsWith("/")) {
		normalizedPathname = `/${normalizedPathname}`;
	}
	if (normalizedPathname.length > 1 && normalizedPathname.endsWith("/")) {
		normalizedPathname = normalizedPathname.slice(0, -1);
	}
	return normalizedPathname;
};

/**
 * Whether a normalized request path is one of the paths captcha protects. Shared
 * by the request handler and the startup check so the two cannot disagree about
 * what is covered.
 */
const isProtectedPath = (pathname: string, endpoints: string[]) =>
	endpoints.some((endpoint) =>
		endpoint.includes("*")
			? wildcardMatch(endpoint)(pathname)
			: endpoint === pathname,
	);

/** Whether a path sits under one of the auth families captcha leaves to opt-in. */
const isAuthPath = (pathname: string) =>
	authPathPrefixes.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);

export const captcha = (options: CaptchaOptions) =>
	({
		id: "captcha",
		version: PACKAGE_VERSION,
		$ERROR_CODES: EXTERNAL_ERROR_CODES,
		init(ctx) {
			// An explicit `endpoints` array is a deliberate choice, so only advise
			// when the defaults are in use and may not be what the user expects.
			if (options.endpoints) return;

			const basePath = ctx.options.basePath ?? "/api/auth";
			const uncovered: string[] = [];
			for (const plugin of ctx.options.plugins ?? []) {
				for (const endpoint of Object.values(plugin.endpoints ?? {})) {
					// Path-less endpoints are reachable directly rather than by URL,
					// so they can never be captcha-protected and are skipped.
					if (!endpoint.path) continue;
					const path = normalizeEndpointPath(endpoint.path, basePath);
					if (isAuthPath(path) && !isProtectedPath(path, defaultEndpoints)) {
						uncovered.push(`${path} (${plugin.id})`);
					}
				}
			}
			if (uncovered.length === 0) return;

			ctx.logger.warn(
				`[better-auth] \`captcha\` is using its default \`endpoints\`, which only cover Email & Password sign-in, sign-up, and password reset. These auth endpoints added by other plugins are not captcha-protected: ${uncovered.join(", ")}. Add them to the captcha \`endpoints\` option (wildcards such as "/sign-in/*" are supported) if you want them challenged.`,
			);
		},
		onRequest: async (request, ctx) => {
			try {
				const endpoints = options.endpoints?.length
					? options.endpoints
					: defaultEndpoints;

				const url = new URL(request.url);
				const basePath = ctx.options.basePath ?? "/api/auth";
				const pathname = normalizeEndpointPath(url.pathname, basePath);

				if (!isProtectedPath(pathname, endpoints)) {
					return undefined;
				}

				if (options.provider === Providers.VERCEL_BOTID) {
					return await verifyHandlers.vercelBotId({
						request,
						checkBotId: options.checkBotId,
						validateRequest: options.validateRequest,
					});
				}

				if (!options.secretKey) {
					throw new Error(INTERNAL_ERROR_CODES.MISSING_SECRET_KEY.message);
				}

				const captchaResponse = request.headers.get("x-captcha-response");
				const remoteUserIP = getIP(request, ctx.options) ?? undefined;

				if (!captchaResponse) {
					return middlewareResponse({
						message: EXTERNAL_ERROR_CODES.MISSING_RESPONSE.message,
						code: EXTERNAL_ERROR_CODES.MISSING_RESPONSE.code,
						status: 400,
					});
				}

				const siteVerifyURL =
					options.siteVerifyURLOverride || siteVerifyMap[options.provider];

				const handlerParams = {
					siteVerifyURL,
					captchaResponse,
					secretKey: options.secretKey,
					remoteIP: remoteUserIP,
				};

				if (options.provider === Providers.CLOUDFLARE_TURNSTILE) {
					return await verifyHandlers.cloudflareTurnstile({
						...handlerParams,
						logger: ctx.logger,
						expectedAction: options.expectedAction,
						allowedHostnames: options.allowedHostnames,
					});
				}

				if (options.provider === Providers.GOOGLE_RECAPTCHA) {
					return await verifyHandlers.googleRecaptcha({
						...handlerParams,
						minScore: options.minScore,
						expectedAction: options.expectedAction,
						allowedHostnames: options.allowedHostnames,
					});
				}

				if (options.provider === Providers.HCAPTCHA) {
					return await verifyHandlers.hCaptcha({
						...handlerParams,
						siteKey: options.siteKey,
					});
				}

				if (options.provider === Providers.CAPTCHAFOX) {
					return await verifyHandlers.captchaFox({
						...handlerParams,
						siteKey: options.siteKey,
					});
				}
			} catch (_error) {
				const errorMessage =
					_error instanceof Error ? _error.message : undefined;

				ctx.logger.error(errorMessage ?? "Unknown error", {
					endpoint: request.url,
					message: _error,
				});

				return middlewareResponse({
					message: EXTERNAL_ERROR_CODES.UNKNOWN_ERROR.message,
					code: EXTERNAL_ERROR_CODES.UNKNOWN_ERROR.code,
					status: 500,
				});
			}
		},
		options,
	}) satisfies BetterAuthPlugin;
