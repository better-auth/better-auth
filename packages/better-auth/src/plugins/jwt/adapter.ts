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
			// Filter expired keys BEFORE picking the latest. Otherwise an
			// expired-but-newer key can shadow a still-valid older one, and
			// callers see "no key" when there's actually a usable candidate.
			const now = new Date();
			const isLive = (k: Jwk) => !k.expiresAt || k.expiresAt > now;
			if (options?.adapter?.getJwks) {
				const keys = await options.adapter.getJwks(ctx);
				return keys
					?.filter(isLive)
					.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
			}
			const keys = await adapter.findMany<Jwk>({
				model: "jwks",
			});
			return keys
				?.filter(isLive)
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
		},
		/**
		 * Look up a key by its `id` (matches the JWS `kid` header). Returns
		 * `undefined` when no key with that id exists.
		 *
		 * When `options.adapter.getJwks` is configured (custom keyring),
		 * filters in-memory after fetching the full set — the custom adapter
		 * isn't required to implement an id index.
		 */
		getKeyById: async (ctx: GenericEndpointContext, id: string) => {
			if (options?.adapter?.getJwks) {
				const keys = await options.adapter.getJwks(ctx);
				return keys?.find((k) => k.id === id);
			}
			return (
				(await adapter.findOne<Jwk>({
					model: "jwks",
					where: [{ field: "id", value: id }],
				})) ?? undefined
			);
		},
		/**
		 * Find the most recent key matching a specific algorithm. Used when
		 * a caller (e.g. an OAuth audience) specifies `signingAlgorithm` but
		 * not a specific `kid`. Returns `undefined` if no key with the alg
		 * exists — callers decide whether to mint one or reject.
		 *
		 * Legacy rows persisted before the `alg` column existed have
		 * `alg: null`. Per `schema.ts`, those rows are treated as the
		 * configured default alg (`options.jwks.keyPairConfig.alg ?? "EdDSA"`),
		 * so deployments that have only legacy rows can still satisfy an
		 * audience-pinned `signingAlgorithm` matching the default.
		 *
		 * Expired keys are filtered out here — see `getLatestKey` for
		 * rationale.
		 */
		getLatestKeyByAlg: async (
			ctx: GenericEndpointContext,
			alg: NonNullable<Jwk["alg"]>,
		) => {
			const candidates = options?.adapter?.getJwks
				? await options.adapter.getJwks(ctx)
				: await adapter.findMany<Jwk>({ model: "jwks" });
			if (!candidates) return undefined;
			const configAlg = options?.jwks?.keyPairConfig?.alg ?? "EdDSA";
			const now = new Date();
			return candidates
				.filter((k) => k.alg === alg || (k.alg == null && configAlg === alg))
				.filter((k) => !k.expiresAt || k.expiresAt > now)
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
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
