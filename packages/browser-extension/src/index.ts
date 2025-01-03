import type { BetterAuthPlugin } from "better-auth";

export const browserExtension: () => BetterAuthPlugin = () => {
	return {
		id: "browser-extension",
		init: (ctx) => {
			const trustedOrigins =
				process.env.NODE_ENV === "development"
					? [...(ctx.options.trustedOrigins || []), "chrome-extension://*"]
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
						const headers = ctx.responseHeader;

						const location = headers.get("location");
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
						const cookie = headers.get("set-cookie");
						if (!cookie) {
							return;
						}
						const url = new URL(location);
						url.searchParams.set("cookie", cookie);
						ctx.setHeader("location", url.toString());
					},
				},
			],
		},
	};
};
