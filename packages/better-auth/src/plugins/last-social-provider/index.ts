import type {
	LastSocialProviderOptions,
	RealizedLastSocialProviderOptions,
} from "./types";
import type { BetterAuthPlugin } from "../../types/plugins";

import { createAuthEndpoint, createAuthMiddleware } from "../../api";

export * from "./types";
export * from "./client";

export const lastSocialProvider = (options?: LastSocialProviderOptions) => {
	const opts: RealizedLastSocialProviderOptions = {
		cookieName: options?.cookieName ?? "better-auth.last_used_social",
		maxAge: options?.maxAge ?? 432000,
	};

	return {
		id: "last-social-provider",
		endpoints: {
			lastUsedSocial: createAuthEndpoint(
				"/last-used-social",
				{
					method: "GET",
					requireHeaders: true,
					metadata: {
						openapi: {
							description:
								"Get the last social provider the user used to sign in.",
							operationId: "lastUsedSocialProvider",
							responses: {
								"200": {
									description:
										"Success - Returns the provider ID of the last social provider",
									content: {
										"application/json": {
											schema: {
												type: "string",
												nullable: true,
												description: "Social Provider ID",
											},
										},
									},
								},
							},
						},
					},
				},
				async (c) => {
					c.context.socialProviders.map(x => x.id)
					const providerId = c.getCookie(opts.cookieName);

					if (!providerId) {
						return null;
					}

					return providerId;
				},
			),
		},
		hooks: {
			after: [
				{
					matcher: (context) => {
						return context.path.startsWith("/callback");
					},

					handler: createAuthMiddleware(async (ctx) => {
						if (!ctx.request?.url) return null;

						const path = new URL(ctx.request?.url).pathname;
						const providerId = path.split("/").at(-1);

						if (!providerId) return;

						ctx.setCookie(opts.cookieName, providerId, {
							httpOnly: true,
							maxAge: opts.maxAge,
						});
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
