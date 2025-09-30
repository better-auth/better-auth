import type { Adapter } from "../../types";
import type { Jwk } from "./types";
import {
	decryptPrivateKey,
	encryptPrivateKey,
	isPrivateKeyEncrypted,
} from "./utils";
import { BetterAuthError } from "../../error";

export const getJwksAdapter = (adapter: Adapter) => {
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
			try {
				const jwks = await adapter.findMany<Jwk>({
					model: "jwks",
				});

				for (let jwk of jwks) {
					if (disablePrivateKeyEncryption) {
						if (isPrivateKeyEncrypted(jwk.privateKey)) {
							jwk.privateKey = await decryptPrivateKey(secret, jwk.privateKey);
							await adapter.update({
								model: "jwks",
								where: [{ field: "id", value: jwk.id }],
								update: jwk,
							});
						}
					} else {
						if (!isPrivateKeyEncrypted(jwk.privateKey)) {
							jwk.privateKey = await encryptPrivateKey(secret, jwk.privateKey);
							await adapter.update({
								model: "jwks",
								where: [{ field: "id", value: jwk.id }],
								update: jwk,
							});
						}
					}
				}
			} catch {
				// It throws exception when "jwks" table does not exist, but there is no work to be done
			}
		},
		createKey: async (key: Omit<Jwk, "id">) => {
			const jwk = await adapter.create<Omit<Jwk, "id">, Jwk>({
				model: "jwks",
				data: {
					...key,
					createdAt: new Date(),
				},
			});

			return jwk;
		},
		importKey: async (key: Jwk): Promise<Jwk> => {
			if (key.id) {
				const oldKey = await adapter.findOne<Jwk>({
					model: "jwks",
					where: [{ field: "id", value: key.id }],
				});
				if (oldKey !== null)
					throw new BetterAuthError(
						`Cannot import JWK with ID "${key.id}": Already exists!`,
						key.id,
					);
			}
			return adapter.create<Jwk>({
				model: "jwks",
				forceAllowId: key.id !== undefined,
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
			key.id = keyId + " revoked";
			return await adapter.update({
				model: "jwks",
				where: [{ field: "id", value: keyId }],
				update: key,
			});
		},
	};
};
