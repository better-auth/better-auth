import type { BetterAuthPlugin } from "better-auth";
import { isDevelopment } from "../../utils/env";

export const expo = () => {
	return {
		id: "expo",
		init: (ctx) => {
			return {
				options: {
					/**
					 * Add expo go as a trusted origin on dev
					 */
					trustedOrigins: isDevelopment ? ["exp://"] : [],
				},
			};
		},
		hooks: {
			after: [
				{
					matcher(context) {
						return context.path?.startsWith("/callback");
					},
					handler: async (ctx) => {
						const response = ctx.context.returned as Response;
						if (response.status === 302) {
							const location = response.headers.get("location");
							if (!location) {
								return;
							}
							const trustedOrigins = ctx.context.trustedOrigins.filter(
								(origin) => !origin.startsWith("http"),
							);
							const isTrustedOrigin = trustedOrigins.some((origin) =>
								location?.startsWith(origin),
							);
							if (!isTrustedOrigin) {
								return;
							}
							const cookie = response.headers.get("set-cookie");
							if (!cookie) {
								return;
							}
							const url = new URL(location);
							url.searchParams.set("cookie", cookie);
							response.headers.set("location", url.toString());
							console.log("Redirecting to", url.toString());
							return {
								response,
							};
						}
					},
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
