import type { BetterAuthPlugin } from "better-auth";

export const expo = () => {
	return {
		id: "expo",
		init: (ctx) => {
			const trustedOrigins =
				process.env.NODE_ENV === "development"
					? [...(ctx.options.trustedOrigins || []), "exp://"]
					: ctx.options.trustedOrigins;
			return {
				options: {
					trustedOrigins,
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
