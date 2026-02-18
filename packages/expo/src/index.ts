import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { expoAuthorizationProxy } from "./routes";

export interface ExpoOptions {
	/**
	 * Disable origin override for expo API routes
	 * When set to true, the origin header will not be overridden for expo API routes
	 */
	disableOriginOverride?: boolean | undefined;
}

export const expo = (options?: ExpoOptions | undefined) => {
	return {
		id: "expo",
		init: (ctx) => {
			const trustedOrigins =
				process.env.NODE_ENV === "development" ? ["exp://"] : [];

			return {
				options: {
					trustedOrigins,
				},
			};
		},
		async onRequest(request, ctx) {
			if (options?.disableOriginOverride || request.headers.get("origin")) {
				return;
			}
			/**
			 * To bypass origin check from expo, we need to set the origin
			 * header to the expo-origin header
			 */
			const expoOrigin = request.headers.get("expo-origin");
			if (!expoOrigin) {
				return;
			}

			// Construct new Headers with new Request to avoid mutating the original request
			const newHeaders = new Headers(request.headers);
			newHeaders.set("origin", expoOrigin);
			const req = new Request(request, { headers: newHeaders });

			return {
				request: req,
			};
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
						if (isHttpRedirect) {
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
			expoAuthorizationProxy,
		},
		options,
	} satisfies BetterAuthPlugin;
};
