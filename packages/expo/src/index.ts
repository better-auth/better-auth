import type { BetterAuthPlugin } from "better-auth";

export const expo: () => BetterAuthPlugin = () => {
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
				{
					matcher(context) {
						return context.path?.startsWith("/sign-in/social");
					},
					handler: async (ctx) => {
						const response = ctx.context.returned as Response;
						let data = await response.json();

						if (data.idToken) {
							const cookie = ctx.responseHeader.get("set-cookie");
							if (!cookie) {
								return;
							}

							data = {
								...data,
								redirect: false,
								cookie,
							};
						}

						ctx.context.returned = new Response(JSON.stringify(data), {
							status: 200,
						});
					},
				},
			],
		},
	};
};
