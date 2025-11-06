import type {
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type { Jwk, JwtOptions } from "./types";

export const getJwksAdapter = (
	adapter: DBAdapter<BetterAuthOptions>,
	options?: JwtOptions,
) => {
	return {
		getAllKeys: async (ctx: GenericEndpointContext) => {
			if (options?.adapter?.getJwks) {
				return await options.adapter.getJwks(ctx);
			}
			return await adapter.findMany<Jwk>({
				model: "jwks",
			});
		},
		getLatestKey: async (ctx: GenericEndpointContext) => {
			if (options?.adapter?.getLatestKey) {
				return await options.adapter.getLatestKey(ctx);
			}
			const key = await adapter.findMany<Jwk>({
				model: "jwks",
				sortBy: {
					field: "createdAt",
					direction: "desc",
				},
				limit: 1,
			});

			return key[0];
		},
		createJwk: async (ctx: GenericEndpointContext, webKey: Omit<Jwk, "id">) => {
			if (options?.adapter?.createJwk) {
				return await options.adapter.createJwk(webKey, ctx);
			}
			const jwk = await adapter.create<Omit<Jwk, "id">, Jwk>({
				model: "jwks",
				data: {
					...webKey,
					createdAt: new Date(),
				},
			});

			return jwk;
		},
	};
};
