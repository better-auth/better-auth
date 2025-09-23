import type { AuthContext } from "../../types";
import type { LogHandlerParams, LogLevel } from "../../utils/logger";
import type { CryptoKeyIdAlg, JwkAlgorithm, JwtPluginOptions } from "./types";
import { importJWK, type JWK } from "jose";
import { BetterAuthError } from "../../error";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { joseSecs } from "../../utils/time";

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
 *
 * @description The `data` is modified in place, there is no copy and this function does not return anything.
 */
export function removeJwtClaims(
	data: Record<string, unknown>,
	logger?: Record<LogLevel, (...params: LogHandlerParams) => void>,
): void {
	const reservedClaims = ["aud", "exp", "iat", "iss", "jti", "nbf", "sub"];
	const editableClaims = ["aud", "exp", "iat", "jti", "nbf", "sub"];

	for (const claim of reservedClaims) {
		if (data[claim] !== undefined) {
			let warn: string = `Signing JWT: Removing "${claim}" field from the data to be signed (affects original record!). This is a reserved field.`;
			if (editableClaims.includes(claim))
				warn +=
					' If you need to edit this JWT Claim, provide its override in "signJwt" function\'s "options.claims" argument.';
			else
				warn +=
					' If you need to edit this field (unrecommended), sign the payload yourself with a key from "getJwk".';
			logger?.warn(warn);
			delete data[claim];
		}
	}
}
