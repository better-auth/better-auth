import type { GenericEndpointContext } from "@better-auth/core";
import { getWebcryptoSubtle } from "@better-auth/utils";
import { exportJWK, generateKeyPair } from "jose";
import { symmetricEncrypt } from "../../crypto";
import { joseSecs } from "../../utils/time";
import { getJwksAdapter } from "./adapter";
import type { Jwk, JwtOptions } from "./types";

/**
 * Converts an expirationTime to ISO seconds expiration time (the format of JWT exp)
 *
 * See https://github.com/panva/jose/blob/main/src/lib/jwt_claims_set.ts#L245
 *
 * @param expirationTime - see options.jwt.expirationTime
 * @param iat - the iat time to consolidate on
 * @returns
 */
export function toExpJWT(
	expirationTime: number | Date | string,
	iat: number,
): number {
	if (typeof expirationTime === "number") {
		return expirationTime;
	} else if (expirationTime instanceof Date) {
		return Math.floor(expirationTime.getTime() / 1000);
	} else {
		return iat + joseSecs(expirationTime);
	}
}

async function deriveKey(secretKey: string): Promise<CryptoKey> {
	const enc = new TextEncoder();
	const subtle = getWebcryptoSubtle();
	const keyMaterial = await subtle.importKey(
		"raw",
		enc.encode(secretKey),
		{ name: "PBKDF2" },
		false,
		["deriveKey"],
	);

	return subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: enc.encode("encryption_salt"),
			iterations: 100000,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

export async function generateExportedKeyPair(
	options?: JwtOptions | undefined,
) {
	const { alg, ...cfg } = options?.jwks?.keyPairConfig ?? {
		alg: "EdDSA",
		crv: "Ed25519",
	};
	const { publicKey, privateKey } = await generateKeyPair(alg, {
		...cfg,
		extractable: true,
	});

	const publicWebKey = await exportJWK(publicKey);
	const privateWebKey = await exportJWK(privateKey);

	return { publicWebKey, privateWebKey, alg, cfg };
}

/**
 * Creates a Jwk on the database
 *
 * @param ctx
 * @param options
 * @returns
 */
export async function createJwk(
	ctx: GenericEndpointContext,
	options?: JwtOptions | undefined,
) {
	const { publicWebKey, privateWebKey, alg, cfg } =
		await generateExportedKeyPair(options);

	const stringifiedPrivateWebKey = JSON.stringify(privateWebKey);
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;
	let jwk: Omit<Jwk, "id"> = {
		alg,
		...(cfg && "crv" in cfg
			? {
					crv: (cfg as { crv: (typeof jwk)["crv"] }).crv,
				}
			: {}),
		publicKey: JSON.stringify(publicWebKey),
		privateKey: privateKeyEncryptionEnabled
			? JSON.stringify(
					await symmetricEncrypt({
						key: ctx.context.secret,
						data: stringifiedPrivateWebKey,
					}),
				)
			: stringifiedPrivateWebKey,
		createdAt: new Date(),
		...(options?.jwks?.rotationInterval
			? {
					expiresAt: new Date(
						Date.now() + options.jwks.rotationInterval * 1000,
					),
				}
			: {}),
	};

	const adapter = getJwksAdapter(ctx.context.adapter, options);
	const key = await adapter.createJwk(ctx, jwk as Jwk);

	return key;
}
