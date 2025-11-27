import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "../api";

export const crossSubdomainCookies = (): BetterAuthPlugin => {
	return {
		id: "cross-subdomain-cookies",
		hooks: {
			before: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx: any) => {
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
									const requestDomain = origin ? new URL(origin).hostname : referer ? new URL(referer).hostname : null;

									if (requestDomain && requestDomain.includes(baseDomain)) {
										ctx.setHeader("Access-Control-Allow-Origin", origin || "*");
										ctx.setHeader("Access-Control-Allow-Credentials", "true");
										ctx.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
										ctx.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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