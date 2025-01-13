import type { BetterAuthPlugin } from "better-auth";

export const expo: () => BetterAuthPlugin = () => {
	return {
		id: "expo",
		init: (ctx) => {
			const trustedOrigins =
				process.env.NODE_ENV === "development"
					? [...(ctx.trustedOrigins || []), "exp://"]
					: ctx.trustedOrigins;
			return {
				options: {
					trustedOrigins,
				},
			};
		},
		async onRequest(request, ctx) {
			if (request.headers.get("origin")) {
				return;
			}
			/**
			 * To bypass origin check from expo, we need to set the origin header to the expo-origin header
			 */
			const expoOrigin = request.headers.get("expo-origin");
			if (!expoOrigin) {
				return;
			}
			request.headers.set("origin", expoOrigin);
			return {
				request,
			};
		},
		hooks: {
			after: [
				{
					matcher(context) {
						return (
							context.path?.startsWith("/callback") ||
							context.path?.startsWith("/oauth2/callback")
						);
					},
					handler: async (ctx) => {
						const headers = ctx.responseHeader;

						const location = headers.get("location");
						if (!location) {
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
