import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { flutterAuthorizationProxy } from "./routes";
import { PACKAGE_VERSION } from "./version";

export interface FlutterOptions {
	/**
	 * Disable origin override for Flutter API routes.
	 * When set to true, the origin header will not be overridden from
	 * the `flutter-origin` request header.
	 */
	disableOriginOverride?: boolean | undefined;
}

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		flutter: {
			creator: typeof flutter;
		};
	}
}

/**
 * Better Auth server plugin for Flutter / Dart clients.
 *
 * Adds trusted-origin helpers for custom URL schemes, copies
 * `flutter-origin` into the request origin header (so CSRF/origin
 * checks work without a browser Origin), and attaches session cookies
 * to deep-link redirects after OAuth / magic-link / email verification.
 */
export const flutter = (options?: FlutterOptions | undefined) => {
	return {
		id: "flutter",
		version: PACKAGE_VERSION,
		init: () => {
			return {
				options: {
					trustedOrigins: [],
				},
			};
		},
		async onRequest(request) {
			if (options?.disableOriginOverride || request.headers.get("origin")) {
				return;
			}
			/**
			 * To bypass origin check from Flutter clients, set the origin
			 * header from the flutter-origin header.
			 */
			const flutterOrigin = request.headers.get("flutter-origin");
			if (!flutterOrigin) {
				return;
			}

			try {
				// Prefer in-place mutation (works on Bun, Node, Deno).
				request.headers.set("origin", flutterOrigin);
				return { request };
			} catch {
				// Cloudflare Workers has immutable headers on incoming requests,
				// so fall back to constructing a new Request.
				const newHeaders = new Headers(request.headers);
				newHeaders.set("origin", flutterOrigin);
				return { request: new Request(request, { headers: newHeaders }) };
			}
		},
		hooks: {
			after: [
				{
					matcher(context) {
						return !!(
							context.path?.startsWith("/callback") ||
							context.path?.startsWith("/oauth2/callback") ||
							context.path?.startsWith("/magic-link/verify") ||
							context.path?.startsWith("/verify-email")
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const headers = ctx.context.responseHeaders;
						const location = headers?.get("location");
						if (!location) {
							return;
						}
						const isProxyURL = location.includes("/oauth-proxy-callback");
						if (isProxyURL) {
							return;
						}
						let redirectURL: URL;
						try {
							redirectURL = new URL(location);
						} catch {
							return;
						}
						const isHttpRedirect =
							redirectURL.protocol === "http:" ||
							redirectURL.protocol === "https:";
						const isLoopbackHttpRedirect =
							isHttpRedirect &&
							(redirectURL.hostname === "localhost" ||
								redirectURL.hostname === "127.0.0.1");
						if (isHttpRedirect && !isLoopbackHttpRedirect) {
							return;
						}
						const isTrustedOrigin = ctx.context.isTrustedOrigin(location);
						if (!isTrustedOrigin) {
							return;
						}
						const cookie = headers?.get("set-cookie");
						if (!cookie) {
							return;
						}
						redirectURL.searchParams.set("cookie", cookie);
						ctx.setHeader("location", redirectURL.toString());
					}),
				},
			],
		},
		endpoints: {
			flutterAuthorizationProxy,
		},
		options,
	} satisfies BetterAuthPlugin;
};
