import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import * as z from "zod";
import { expoAuthorizationProxy, getIssuedOriginIdentifier } from "./routes";
import { PACKAGE_VERSION } from "./version";

const issuedAuthorizationSchema = z.object({
	url: z.string(),
	redirect: z.literal(true),
});

export interface ExpoOptions {
	/**
	 * Disable origin override for expo API routes
	 * When set to true, the origin header will not be overridden for expo API routes
	 */
	disableOriginOverride?: boolean | undefined;
}

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		expo: {
			creator: typeof expo;
		};
	}
}

export const expo = (options?: ExpoOptions | undefined) => {
	return {
		id: "expo",
		version: PACKAGE_VERSION,
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

			try {
				// Prefer in-place mutation (works on Bun, Node, Deno).
				request.headers.set("origin", expoOrigin);
				return { request };
			} catch {
				// Cloudflare Workers has immutable headers on incoming requests,
				// so fall back to constructing a new Request.
				const newHeaders = new Headers(request.headers);
				newHeaders.set("origin", expoOrigin);
				return { request: new Request(request, { headers: newHeaders }) };
			}
		},
		hooks: {
			after: [
				{
					// SSO providers live in the database, so the proxy cannot list their
					// endpoints. Other sign-in routes can return caller-chosen URLs.
					matcher(context) {
						return context.path === "/sign-in/sso";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const issued = issuedAuthorizationSchema.safeParse(
							ctx.context.returned,
						);
						if (!issued.success || !URL.canParse(issued.data.url)) {
							return;
						}
						const url = new URL(issued.data.url);
						const state = url.searchParams.get("state");
						if (url.protocol !== "https:" || !state) {
							return;
						}
						// Users can register SSO providers with any endpoint, so only the
						// operator's trusted origins may become proxy targets.
						if (!ctx.context.isTrustedOrigin(url.href)) {
							return;
						}
						await ctx.context.internalAdapter.createVerificationValue({
							identifier: getIssuedOriginIdentifier(state),
							value: url.origin,
							// Matches the lifetime of the OAuth state record.
							expiresAt: new Date(Date.now() + 10 * 60 * 1000),
						});
					}),
				},
				{
					matcher(context) {
						return !!(
							context.path?.startsWith("/callback") ||
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
