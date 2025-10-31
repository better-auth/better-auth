import type { AuthContext } from "@better-auth/core";
import type { InternalLogger } from "@better-auth/core/env";
import type { CryptoKeyIdAlg, JwkAlgorithm, JwtPluginOptions } from "./types";
import { importJWK, type JWK } from "jose";
import { BetterAuthError } from "@better-auth/core/error";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { joseSecs } from "../../utils/time";

export const revokedTag = " revoked";

/**
 * Retrieves the **"jwt" plugin options**.
 *
 * ⓘ ****the latest key** in the **database** only**: This function is not exported from `better-auth/plugins/jwt`.
 *
 * @param ctx - The current authentication context.
 *
 * @throws {`BetterAuthError`} - If the "jwt" plugin was not found in the authentication context.
 *
 * @returns The **JWT plugin options** if available, or `undefined`.
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
 * Derives a **public** {`JWK`} by removing all **private JWK material**.
 *
 * @description Extracts only the **public components** of {`JWK`} by omitting **private fields** such as `"d"`, `"p"`, `"q"`, `"dp"`, `"dq"`, and `"qi"`.
 *
 * @param privateJwk - {`JWK`} to be converted.
 *
 * @returns A **public-only** {`JWK`} object.
 */
export function getPublicJwk(
	privateJwk: JWK,
): Omit<JWK, "d" | "p" | "q" | "dp" | "dq" | "qi"> {
	const { d, p, q, dp, dq, qi, ...publicJwk } = privateJwk;
	return publicJwk;
}

/**
 * Checks if the {@link JWK **JWK**} represents a **public JWK**.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`.
 *
 * @description Checks if the {@link JWK **JWK**} contains any **private JWK fields**: `"d"`, `"p"`, `"q"`, `"dp"`, `"dq"`, or `"qi"`. If none of these fields are present, the {@link JWK **JWK**} is considered **public**.
 *
 * @param jwk - {@link JWK **JWK**} to check.
 *
 * @returns `true` if `jwk` is a **public JWK**, otherwise `false`.
 */
export function isPublicKey(jwk: JWK): boolean {
	const privateParts = ["d", "p", "q", "dp", "dq", "qi"];
	return !privateParts.some((privateField) => privateField in jwk);
}

/**
 * Determines whether the {@link JWK **JWK**} is **encrypted**.
 *
 * @description Assumes the **private JWK** is **encrypted** if it does **not** start with `"{"`, which a valid {@link JWK **JWK**} would. This is a rather fragile heuristic.
 *
 * @param key - The {@link JWK **JWK**} to test. Should be a **private JWK**.
 *
 * @returns `true` if it seems like the **private JWK** is **encrypted**.
 **/
export function isPrivateKeyEncrypted(key: string) {
	return key.at(0) !== "{";
}

/**
 * Encrypts the {@link JWK **JWK**}.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`.
 *
 * @param secret - The Better Auth **secret**.
 * @param stringifiedPrivateWebKey - The {@link JWK **JWK**} to encrypt. Should be a **private key**.
 *
 * @returns The **encrypted JWK**.
 */
export async function encryptPrivateKey(
	secret: string,
	stringifiedPrivateWebKey: string,
): Promise<string> {
	return JSON.stringify(
		await symmetricEncrypt({ key: secret, data: stringifiedPrivateWebKey }),
	);
}

/**
 * Decrypts the **encrypted JWK**.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`.
 *
 * @param secret - The Better Auth **secret**.
 * @param privateKey - The **encrypted JWK**. Should be a **private key**.
 *
 * @throws {`BetterAuthError`} - If decryption failed, typically because the provided `secret` does not match the one used for encryption.
 *
 * @returns The **decrypted JWK**.
 */
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
 * Decrypts or encrypts the {@link JWK **JWK**} depending on `disablePrivateKeyEncryption`, if needed.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`.
 *
 * @param secret - The Better Auth **secret**.
 * @param privateKey - The {@link JWK **JWK**}. Should be a **private key**.
 *
 * @throws {`BetterAuthError`} - If decryption failed, typically because the provided `secret` does not match the one used for encryption.
 *
 * @returns The **decrypted** or **encrypted JWK**.
 */
export async function ensureProperKeyEncryption(
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
 * Checks if the algorithm is a valid **JWK algorithm**.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`.
 *
 * @param jwkAlgorithm - The algorithm to be validated.
 *
 * @returns `true` if `jwkAlgorithm` is any of these: `"EdDSA"`, `"ES256"`, `"ES512"`, `"PS256"`, `"RS256"`.
 **/
export function isJwkAlgValid(jwkAlgorithm: string): boolean {
	return ["EdDSA", "ES256", "ES512", "PS256", "RS256"].includes(jwkAlgorithm);
}

/**
 * Parses {`JWK`} object into {`CryptoKeyExtended`} object.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`.
 *
 * @description Validates the **JWK algorithm** before importing the {@link JWK **JWK**}, and extracts `kid` and `alg` into separate fields since these identifiers are not part of the {`CryptoKey`} interface.
 *
 * @param key - The {@link JWK **JWK**} to be parsed.
 *
 * @throws {`BetterAuthError`} - If the **JWK algorithm** (`alg`) is invalid.
 * @throws {`JOSEError`} - If *JOSE* failed to parse the {@link JWK **JWK**}.
 *
 * @returns A {`CryptoKeyExtended`} object containing:
 * - `id`: The key **ID** (`kid`).
 * - `alg`: The validated **JWK algorithm**.
 * - `key`: The imported {`CryptoKey`} instance.
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
 * Converts the *JOSE* **"expiration"** or **"not before"** time to a **UNIX timestamp (seconds)** format required by {`JWT`}.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`.
 *
 * @see https://github.com/panva/jose/blob/main/src/lib/jwt_claims_set.ts#L245
 *
 * @description 
 * - If `time` is a {`string`}, it is parsed like `jwt.expirationTime` in {@link JwtPluginOptions `JwtPluginOptions`} (e.g. `"5m"`) and added/subtracted from `iat ?? (Date.now() / 1000)`.
 * - If `time` is a {`Date`}, it is converted to a **UNIX timestamp (seconds)**.
 * - If `time` is a {`number`}, it is returned as-is without validation.
 *
 * @param time - The time to be converted.
 * @param iat - The **JWT "Issued At" (iat)** claim used when `time` is a {`string`} and `Date.now()` should not be used as a reference.
 *
 * @returns The converted **UNIX timestamp (seconds)**.
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
 * Data sanitizer that makes sure `data` does not contain any of the **#RFC7519 JWT Claims**.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`.
 *
 * @description Ensures that the provided `data` does not contain **JWT Claims**: `aud`, `exp`, `iat`, `iss`, `jti`, `nbf`, or `sub`. It logs a warning for each **removed JWT Claim** via the optional `logger` without modifying the original object.
 *
 * @param data - The data to sanitize.
 * @param logger - A logger to warn about **removed JWT Claims**.
 *
 * @returns The **sanitized data** without **JWT Claims**.
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
