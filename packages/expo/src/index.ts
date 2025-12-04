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
			const req = request.clone();
			req.headers.set("origin", expoOrigin);
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
							context.path?.startsWith("/oauth2/callback")
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
						const trustedOrigins = ctx.context.trustedOrigins.filter(
							(origin: string) => !origin.startsWith("http"),
						);
						const isTrustedOrigin = trustedOrigins.some((origin: string) =>
							location?.startsWith(origin),
						);
						if (!isTrustedOrigin) {
							return;
						}
						const cookie = headers?.get("set-cookie");
						if (!cookie) {
							return;
						}
						const url = new URL(location);
						url.searchParams.set("cookie", cookie);
						ctx.setHeader("location", url.toString());
					}),
				},
			],
		},
		endpoints: {
			expoAuthorizationProxy,
		},
	} satisfies BetterAuthPlugin;
};
