import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type { Jwk } from "./types";
import { ensureProperEncryption, getPublicJwk, revokedTag } from "./utils";
import { BetterAuthError } from "@better-auth/core/error";
import type { JWK } from "jose";

export const getJwksAdapter = (adapter: DBAdapter<BetterAuthOptions>) => {
	return {
		getAllKeys: async (): Promise<Jwk[] | undefined> => {
			return await adapter.findMany<Jwk>({
				model: "jwks",
			});
		},
		getKeyById: async (keyId: string): Promise<Jwk | null> => {
			return await adapter.findOne<Jwk>({
				model: "jwks",
				where: [{ field: "id", value: keyId }],
			});
		},
		getLatestKey: async (): Promise<Jwk | undefined> => {
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
		updateKeysEncryption: async (
			secret: string,
			disablePrivateKeyEncryption: boolean,
		) => {
			const jwks = await adapter.findMany<Jwk>({
				model: "jwks",
			});

			for (let jwk of jwks) {
				const privateKey = await ensureProperEncryption(
					secret,
					jwk.privateKey,
					disablePrivateKeyEncryption,
				);
				if (privateKey !== jwk.privateKey) {
					jwk.privateKey = privateKey;
					await adapter.update({
						model: "jwks",
						where: [{ field: "id", value: jwk.id }],
						update: jwk,
					});
				}
			}
		},
		createKey: async (key: Omit<Jwk, "id">): Promise<Jwk> => {
			// This is one of "whys" database migration adding "revoked" field would be better
			// todo: check if it is possible to make it an optional field and implement it without a breaking change
			for (let step = 0; step < 10; step++) {
				// todo: If can't do the /todo above, check if we can create ID and check it instead of creating then deleting the key
				const jwk = await adapter.create<Omit<Jwk, "id">, Jwk>({
					model: "jwks",
					data: {
						...key,
						createdAt: new Date(),
					},
				});

				const revokedJwk = await adapter.findOne<Jwk>({
					model: "jwks",
					where: [{ field: "id", value: jwk.id + revokedTag }],
				});

				if (revokedJwk !== null) {
					await adapter.delete({
						model: "jwks",
						where: [{ field: "id", value: jwk.id }],
					});
				} else return jwk;
			}
			throw new BetterAuthError(
				"Failed to create a new JWK: Could not generate a key with an ID that is not revoked",
			);
		},
		importKey: async (key: Jwk): Promise<Jwk> => {
			if (key.id) {
				const oldKey = await adapter.findOne<Jwk>({
					model: "jwks",
					where: [{ field: "id", value: key.id }],
				});
				if (oldKey !== null)
					throw new BetterAuthError(
						`Failed to import JWK: ID "${key.id}" already exists in the database`,
						key.id,
					);
				// This is one of "whys" database migration adding "revoked" field would be better
				const revokedKey = await adapter.findOne<Jwk>({
					model: "jwks",
					where: [{ field: "id", value: key.id + revokedTag }],
				});
				if (revokedKey !== null)
					throw new BetterAuthError(
						`Failed to import JWK: ID "${key.id}" has already been revoked!`,
						key.id,
					);
			}
			if (key.id === undefined) {
				const { id, ...keyWithoutId } = key; // Even if `id` is set to `undefined`, it's seen and throws a warning
				return adapter.create<Omit<Jwk, "id">, Jwk>({
					model: "jwks",
					data: {
						...keyWithoutId,
						createdAt: new Date(),
					},
				});
			}
			return adapter.create<Jwk>({
				model: "jwks",
				forceAllowId: true,
				data: {
					...key,
					createdAt: new Date(),
				},
			});
		},
		revokeKey: async (keyId: string): Promise<Jwk | null | undefined> => {
			const key = await adapter.findOne<Jwk>({
				model: "jwks",
				where: [{ field: "id", value: keyId }],
			});
			if (key === null) return undefined;
			key.id = keyId + revokedTag;
			return await adapter.update({
				model: "jwks",
				where: [{ field: "id", value: keyId }],
				update: key,
			});
		},
		revokeRemoteKey: async (key: JWK): Promise<Jwk> => {
			return adapter.create<Jwk>({
				model: "jwks",
				forceAllowId: true,
				data: {
					// Fight with TypeScript to allow "id" here
					...{
						id: key.kid! + revokedTag,
						privateKey: "",
						publicKey: JSON.stringify(getPublicJwk(key)),
					},
					createdAt: new Date(),
				},
			});
		},
	};
};
