import type { AuthContext } from "@better-auth/core";
import type { DpopSigningAlgorithm } from "@better-auth/core/oauth2";
import type { JWK } from "jose";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import type { SolidDpopKeyPair } from "./dpop";
import { importSolidDpopKeyPair, isSolidDpopAlgorithm } from "./dpop";
import type { SolidDpopKeyRecord } from "./schema";

const SOLID_DPOP_KEY_MODEL = "solidDpopKey";

/**
 * How long a stored DPoP key is kept when the provider does not say when its
 * refresh token expires. Solid providers commonly issue long-lived refresh
 * tokens without a stated lifetime, so this is a garbage-collection horizon,
 * not a security boundary: the key is unusable without the refresh token it is
 * keyed by.
 */
const DEFAULT_KEY_RETENTION_MS = 1000 * 60 * 60 * 24 * 90;

/**
 * Lookup key for a stored DPoP key.
 *
 * The refresh token is hashed rather than stored: the row's whole purpose is to
 * be found by whoever already holds the token, and a hash keeps a database read
 * from yielding a usable credential.
 */
export async function hashSolidToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function keyExpiry(refreshTokenExpiresAt: Date | undefined): Date {
	if (refreshTokenExpiresAt && refreshTokenExpiresAt.getTime() > Date.now()) {
		return refreshTokenExpiresAt;
	}
	return new Date(Date.now() + DEFAULT_KEY_RETENTION_MS);
}

export interface SolidDpopKeyStore {
	save(input: {
		providerId: string;
		refreshToken: string;
		keyPair: SolidDpopKeyPair;
		refreshTokenExpiresAt?: Date | undefined;
	}): Promise<void>;
	load(input: {
		providerId: string;
		refreshToken: string;
	}): Promise<SolidDpopKeyPair | null>;
	rebind(input: {
		providerId: string;
		previousRefreshToken: string;
		refreshToken: string;
		refreshTokenExpiresAt?: Date | undefined;
	}): Promise<void>;
	remove(input: { refreshToken: string }): Promise<void>;
}

/**
 * Database-backed store for the DPoP keys Solid refresh tokens are bound to.
 *
 * Every method is best-effort on the write path and fail-closed on the read
 * path: a key that cannot be stored degrades to "refresh unavailable", which
 * surfaces as a re-authentication, while a key that cannot be decrypted is
 * treated as absent rather than silently skipping the proof.
 */
export function createSolidDpopKeyStore(ctx: AuthContext): SolidDpopKeyStore {
	const findByTokenHash = async (tokenHash: string) =>
		ctx.adapter.findOne<SolidDpopKeyRecord>({
			model: SOLID_DPOP_KEY_MODEL,
			where: [{ field: "tokenHash", value: tokenHash }],
		});

	const deleteByTokenHash = async (tokenHash: string) =>
		ctx.adapter.delete({
			model: SOLID_DPOP_KEY_MODEL,
			where: [{ field: "tokenHash", value: tokenHash }],
		});

	return {
		async save({ providerId, refreshToken, keyPair, refreshTokenExpiresAt }) {
			const tokenHash = await hashSolidToken(refreshToken);
			const privateKey = await symmetricEncrypt({
				key: ctx.secretConfig,
				data: JSON.stringify(keyPair.privateJwk),
			});
			const data = {
				providerId,
				tokenHash,
				jkt: keyPair.jkt,
				algorithm: keyPair.algorithm,
				privateKey,
				createdAt: new Date(),
				expiresAt: keyExpiry(refreshTokenExpiresAt),
			};
			// A repeat token exchange can legitimately re-issue the same refresh
			// token, so replace any row already bound to this hash instead of
			// tripping the unique index.
			const existing = await findByTokenHash(tokenHash);
			if (existing) {
				await ctx.adapter.update({
					model: SOLID_DPOP_KEY_MODEL,
					where: [{ field: "id", value: existing.id }],
					update: data,
				});
				return;
			}
			await ctx.adapter.create({
				model: SOLID_DPOP_KEY_MODEL,
				data,
			});
		},

		async load({ providerId, refreshToken }) {
			const tokenHash = await hashSolidToken(refreshToken);
			const record = await findByTokenHash(tokenHash);
			if (!record) return null;
			if (record.providerId !== providerId) {
				ctx.logger.error(
					`Solid DPoP key for token hash ${tokenHash} belongs to provider "${record.providerId}", not "${providerId}"`,
				);
				return null;
			}
			if (record.expiresAt.getTime() <= Date.now()) {
				await deleteByTokenHash(tokenHash);
				return null;
			}
			if (!isSolidDpopAlgorithm(record.algorithm)) {
				ctx.logger.error(
					`Stored Solid DPoP key uses unsupported algorithm "${record.algorithm}"`,
				);
				return null;
			}
			let privateJwk: JWK;
			try {
				privateJwk = JSON.parse(
					await symmetricDecrypt({
						key: ctx.secretConfig,
						data: record.privateKey,
					}),
				) as JWK;
			} catch (error) {
				ctx.logger.error(
					`Could not decrypt the stored Solid DPoP key. The instance secret may have changed. ${error}`,
				);
				return null;
			}
			const keyPair = await importSolidDpopKeyPair(
				privateJwk,
				record.algorithm as DpopSigningAlgorithm,
			);
			if (keyPair.jkt !== record.jkt) {
				ctx.logger.error(
					"Stored Solid DPoP key does not match its recorded thumbprint",
				);
				return null;
			}
			return keyPair;
		},

		async rebind({
			providerId,
			previousRefreshToken,
			refreshToken,
			refreshTokenExpiresAt,
		}) {
			const previousHash = await hashSolidToken(previousRefreshToken);
			const record = await findByTokenHash(previousHash);
			if (!record) return;
			if (previousRefreshToken === refreshToken) {
				await ctx.adapter.update({
					model: SOLID_DPOP_KEY_MODEL,
					where: [{ field: "id", value: record.id }],
					update: { expiresAt: keyExpiry(refreshTokenExpiresAt) },
				});
				return;
			}
			// The provider rotated the token: move the binding, and drop any row
			// already holding the new hash so the unique index stays satisfied.
			const nextHash = await hashSolidToken(refreshToken);
			const colliding = await findByTokenHash(nextHash);
			if (colliding && colliding.id !== record.id) {
				await deleteByTokenHash(nextHash);
			}
			await ctx.adapter.update({
				model: SOLID_DPOP_KEY_MODEL,
				where: [{ field: "id", value: record.id }],
				update: {
					tokenHash: nextHash,
					expiresAt: keyExpiry(refreshTokenExpiresAt),
				},
			});
		},

		async remove({ refreshToken }) {
			await deleteByTokenHash(await hashSolidToken(refreshToken));
		},
	};
}
