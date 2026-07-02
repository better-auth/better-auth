import type { GenericEndpointContext } from "@better-auth/core";
import { exportJWK, generateKeyPair, generateSecret } from "jose";
import { symmetricEncrypt } from "../../crypto";
import type { TimeString } from "../../utils/time";
import { sec } from "../../utils/time";
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
		return iat + sec(expirationTime as TimeString);
	}
}

export async function generateExportedKeyPair(
	options?: JwtOptions | undefined,
) {
	const { alg, ...cfg } = options?.jwks?.keyPairConfig ?? {
		alg: "EdDSA",
		crv: "Ed25519",
	};

	// Handle HS256 symmetric key generation
	if (alg === "HS256") {
		const secretKey = await generateSecret(alg, { extractable: true });
		const secretWebKey = await exportJWK(secretKey);
		// For symmetric keys, the privateWebKey contains the secret
		// and the publicWebKey is a marker object to indicate it's symmetric
		return {
			publicWebKey: { kty: "oct", symmetric: true } as Record<string, unknown>,
			privateWebKey: secretWebKey,
			alg,
			cfg,
		};
	}

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

	// Resolve the curve for persistence. Two sources, in priority order:
	//   1. Explicit `keyPairConfig.crv` (e.g., Ed25519 for EdDSA).
	//   2. The curve jose derived from the algorithm at generation
	//      (e.g., P-256 for ES256, P-521 for ES512). Reading it off the
	//      exported JWK keeps `jwks.crv` populated for EC keys whose
	//      curve is implicit in the alg — without this, `crv` was null
	//      for everything except EdDSA, defeating the audience-pinning
	//      tripwire that depends on the column.
	const explicitCrv =
		cfg && "crv" in cfg ? (cfg as { crv: string }).crv : undefined;
	const derivedCrv =
		typeof (publicWebKey as { crv?: unknown }).crv === "string"
			? (publicWebKey as { crv: string }).crv
			: undefined;
	const crv = explicitCrv ?? derivedCrv;

	const stringifiedPrivateWebKey = JSON.stringify(privateWebKey);
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;
	const jwk: Omit<Jwk, "id"> = {
		alg,
		...(crv ? { crv: crv as (typeof jwk)["crv"] } : {}),
		publicKey: JSON.stringify(publicWebKey),
		privateKey: privateKeyEncryptionEnabled
			? JSON.stringify(
					await symmetricEncrypt({
						key: ctx.context.secretConfig,
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
