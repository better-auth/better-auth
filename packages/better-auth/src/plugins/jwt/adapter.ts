import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type { Jwk } from "./types";

export const getJwksAdapter = (adapter: DBAdapter<BetterAuthOptions>) => {
	return {
		getAllKeys: async () => {
			return await adapter.findMany<Jwk>({
				model: "jwks",
			});
		},
		getLatestKey: async () => {
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
		createJwk: async (webKey: Omit<Jwk, "id">) => {
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
