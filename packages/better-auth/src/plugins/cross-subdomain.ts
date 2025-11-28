import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "../api";

export const crossSubdomainCookies = (): BetterAuthPlugin => {
	return {
		id: "cross-subdomain-cookies",
		hooks: {
			before: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						// Middleware to handle cross-subdomain cookie access
						const options = ctx.context.options.advanced?.crossSubDomainCookies;
						if (!options?.enabled || !ctx.request) {
							return;
						}

						// Ensure cookies are accessible across subdomains
						// This middleware can be extended to handle specific cross-subdomain logic
						const headers = ctx.request.headers;
						const origin = headers?.get("origin");
						const referer = headers?.get("referer");

						// Add CORS headers if needed for cross-subdomain requests
						if (origin || referer) {
							const baseURL = ctx.context.options.baseURL;
							if (baseURL) {
								try {
									const baseDomain = new URL(baseURL).hostname;
									const requestOrigin =
										origin || (referer ? new URL(referer).origin : null);
									const requestDomain = requestOrigin
										? new URL(requestOrigin).hostname
										: null;

									// Proper subdomain validation - exact match or proper subdomain
									const requestHost = requestDomain?.split(":")[0]; // Remove port if present
									const baseHost = baseDomain?.split(":")[0];
									const isSubdomain =
										requestHost === baseHost ||
										(requestHost &&
											baseHost &&
											requestHost.endsWith(`.${baseHost}`));

									if (isSubdomain && requestOrigin) {
										ctx.setHeader("Access-Control-Allow-Origin", requestOrigin);
										ctx.setHeader("Access-Control-Allow-Credentials", "true");
										ctx.setHeader(
											"Access-Control-Allow-Methods",
											"GET, POST, PUT, DELETE, OPTIONS",
										);
										ctx.setHeader(
											"Access-Control-Allow-Headers",
											"Content-Type, Authorization",
										);
									}
								} catch (error) {
									// Invalid URL, skip CORS headers
								}
							}
						}
					}),
				},
			],
		},
	};
};
