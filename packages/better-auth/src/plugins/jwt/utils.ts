import type { AuthContext } from "@better-auth/core";
import type { InternalLogger } from "@better-auth/core/env";
import type { CryptoKeyIdAlg, JwkAlgorithm, JwtPluginOptions } from "./types";
import { importJWK, type JWK } from "jose";
import { BetterAuthError } from "@better-auth/core/error";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { joseSecs } from "../../utils/time";

export const revokedTag = " revoked";

/**
 * @todo: JSDoc
 */
export const getJwtPluginOptions = (
	ctx: AuthContext,
): JwtPluginOptions | undefined => {
	const plugin = ctx.options.plugins?.find((plugin) => plugin.id === "jwt");
	if (plugin === undefined)
		throw new BetterAuthError(
			'Failed to get "jwt" plugin options: The "jwt" plugin needs to be initialized before calling JWT related functions',
		);
	return plugin.options;
};

/**
 * @todo: JSDoc
 */
export function getPublicJwk(
	privateJwk: JWK,
): Omit<JWK, "d" | "p" | "q" | "dp" | "dq" | "qi"> {
	const { d, p, q, dp, dq, qi, ...publicJwk } = privateJwk;
	return publicJwk;
}

/**
 * @todo: JSDoc; make heurestic stronger by correlating alg to the needed fields
 * @param jwk
 * @returns
 */
export function isPublicKey(jwk: JWK): boolean {
	const privateParts = ["d", "p", "q", "dp", "dq", "qi"];
	return !privateParts.some((privateField) => privateField in jwk);
}

export function isPrivateKeyEncrypted(key: string) {
	// If it is encrypted it will contain hex data, otherwise it is a JSON
	return key.at(0) !== "{";
}

export async function encryptPrivateKey(
	secret: string,
	stringifiedPrivateWebKey: string,
): Promise<string> {
	return JSON.stringify(
		await symmetricEncrypt({ key: secret, data: stringifiedPrivateWebKey }),
	);
}

export async function decryptPrivateKey(
	secret: string,
	privateKey: string,
): Promise<string> {
	return await symmetricDecrypt({
		key: secret,
		data: JSON.parse(privateKey),
	}).catch(() => {
		throw new BetterAuthError(
			"Failed to decrypt the private key: Make sure current secret is the same as the one used to encrypt the private key. " +
				'If you are using a different secret, either cleanup your "jwks" table in the database or provide the old secret temporalily ' +
				"and disable private key encryption then restart server with the new secret and enabled encryption",
			privateKey,
		);
	});
}

export async function ensureProperEncryption(
	secret: string,
	stringifiedPrivateWebKey: string,
	disablePrivateKeyEncryption: boolean,
): Promise<string> {
	if (disablePrivateKeyEncryption) {
		if (isPrivateKeyEncrypted(stringifiedPrivateWebKey))
			return decryptPrivateKey(secret, stringifiedPrivateWebKey);
	} else if (!isPrivateKeyEncrypted(stringifiedPrivateWebKey))
		return encryptPrivateKey(secret, stringifiedPrivateWebKey);
	return stringifiedPrivateWebKey;
}

/**
 * @todo: JSDoc
 */
export function isJwkAlgValid(jwkAlgorithm: string): boolean {
	const JWK_ALGS = ["EdDSA", "ES256", "ES512", "PS256", "RS256"] as const;

	return JWK_ALGS.includes(jwkAlgorithm as JwkAlgorithm);
}

/**
 * @todo: JSDoc
 */
export async function parseJwk(key: JWK): Promise<CryptoKeyIdAlg> {
	if (!isJwkAlgValid(key.alg!))
		throw new BetterAuthError(
			`Failed to parse JWKK: Invalid JWK algorithm: "${key.alg}"`,
			JSON.stringify(key),
		);

	return {
		id: key.kid,
		alg: key.alg as JwkAlgorithm,
		key: (await importJWK(key)) as CryptoKey,
	} satisfies CryptoKeyIdAlg as CryptoKeyIdAlg;
}

/**
 * Converts *JOSE* **"expiration"** or **"not before"** time claims to ISO seconds time (the format of JWT).
 *
 * See https://github.com/panva/jose/blob/main/src/lib/jwt_claims_set.ts#L245
 *
 * @param time - See options.jwt.expirationTime.
 * @param iat - The `iat` ("Issued At" JWT Claim) time to consolidate on.
 *
 * @throws {`TypeError`} - When the time period format is incorrect
 *
 * @returns ISO seconds time
 */
export function toJwtTime(time: number | Date | string, iat?: number): number {
	if (typeof time === "number") {
		return time;
	} else if (time instanceof Date) {
		return Math.floor(time.getTime() / 1000);
	} else {
		return Math.floor((iat ?? Date.now() / 1000) + joseSecs(time));
	}
}

/**
 * Makes sure `data` does not contain any of the *#RFC7519 JWT Claims*.
 */
export function withoutJwtClaims(
	data: Record<string, unknown>,
	logger?: InternalLogger,
): Omit<
	Record<string, unknown>,
	"aud" | "exp" | "iat" | "iss" | "jti" | "nbf" | "sub"
> {
	const reservedClaims = ["aud", "exp", "iat", "iss", "jti", "nbf", "sub"];
	const editableClaims = ["aud", "exp", "iat", "jti", "nbf", "sub"];

	for (const claim of reservedClaims) {
		if (data[claim] !== undefined) {
			let warn: string = `Signing JWT: Removing "${claim}" field from the data to be signed (does not modify original record). This is a reserved field.`;
			if (editableClaims.includes(claim))
				warn +=
					' If you need to edit this JWT Claim, provide its override in "signJwt" function\'s or "/sign-jwt" endpoint\'s "claims" argument.';
			else
				warn +=
					' If you need to edit this field (unrecommended), sign the payload yourself with a key from "getJwk".';
			logger?.warn(warn);
		}
	}
	const { aud, exp, iat, iss, jti, nbf, sub, ...sanitizedData } = data;
	return sanitizedData;
}
