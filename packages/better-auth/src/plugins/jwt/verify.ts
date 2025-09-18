import type { GenericEndpointContext } from "../../types";
import type { JWTPayload, JWTVerifyGetKey, JWTVerifyResult } from "jose";
import type { CryptoKeyIdAlg, VerifyJwtOptions } from "./types";
import { BetterAuthError } from "../../error";
import { getJwksAdapter } from "./adapter";
import { getJwk } from "./jwk";
import { createLocalJWKSet, jwtVerify } from "jose";

/**
 * Verifies a **JWT** using JOSE. Common code for `verifyJWT` and `verifyJWTWithKey`.
 *
 * ⓘ **Internal use only**: This function is not exported.
 *
 * @description `jwk` is a **public key** or a **JSON Web Key Set (JWKS)** used to verify a **JWT**.
 *
 * @param ctx - Endpoint context.
 * @param jwt - **JWT** to verify.
 * @param jwk - A **public key** or a **JSON Web Key Set (JWKS)**.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time.
 *
 * @throws {JWTExpired} - If the token is expired.
 * @throws {JWTClaimValidationFailed} - If a claim (issuer, audience, subject, etc.) is invalid.
 * @throws {JOSEError} - If signature verification fails or the JWT format is invalid.
 * @throws {TypeError} - If `jwk` is not a valid key or JWKS.
 *
 * @returns **JWT Payload** and **Protected Header**.
 */
async function verifyJwtJose(
	ctx: GenericEndpointContext,
	jwt: string,
	jwk: CryptoKey | JWTVerifyGetKey,
	options?: VerifyJwtOptions,
): Promise<JWTVerifyResult<JWTPayload>> {
	const parsedOptions = {
		typ: options?.expectedType === "" ? undefined : "JWT",
		maxTokenAge: options?.maxExpirationTime,
		issuer: options?.allowedIssuers ?? [ctx.context.options.baseURL!],
		audience: options?.allowedAudiences ?? [ctx.context.options.baseURL!],
		subject: options?.expectedSubject,
		requiredClaims: ["iat", "exp"],
	};

	// This check is needed to differentiate between function overloads
	if (jwk instanceof CryptoKey)
		return jwtVerify(jwt, jwk, {
			algorithms: [jwk.algorithm.name],
			...parsedOptions,
		});

	return jwtVerify(jwt, jwk, parsedOptions);
}

/**
 * Verifies a **JWT**. Determines which **JWK** to use from the database based on **JWT "kty" (Key Type) Header Parameter** and **JWT (Key ID) JWT Header** fields.
 *
 * @param ctx - Endpoint context.
 * @param jwt - **JWT** to verify.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {JWTExpired} - If the token is expired.
 * @throws {JWTClaimValidationFailed} - If a claim (issuer, audience, subject, etc.) is invalid.
 * @throws {JOSEError} - If signature verification fails or the JWT format is invalid.
 *
 * @returns **JWT Payload**.
 *
 * @todo Cache **JWKS**.
 */
export async function verifyJwt(
	ctx: GenericEndpointContext,
	jwt: string,
	options?: VerifyJwtOptions,
): Promise<JWTPayload> {
	const adapter = getJwksAdapter(ctx.context.adapter);
	const jwks = await ctx.json({
		keys: (await adapter.getAllKeys()).map((keySet) => ({
			...JSON.parse(keySet.publicKey),
			kid: keySet.id,
		})),
	});
	const localJwks = createLocalJWKSet(jwks);

	const { payload } = await verifyJwtJose(ctx, jwt, localJwks, options);
	return payload;
}

/**
 * Verifies **JWT** with provided key and options.
 *
 * @description Uses `jwk` **public key**, can be an external one or an ID of one in the **JWKS**.
 *
 * @param ctx - Endpoint context.
 * @param jwt - **JWT** to be verified.
 * @param jwk - **ID** of the key in the database or the **public key** itself. If omitted, **latest JWK** will be used. If `id` in the **public key** is not provided, the **"kid" (Key ID) Field** will not be checked in the **JWT Protected Header**.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {JWTExpired} - If the token is expired.
 * @throws {JWTClaimValidationFailed} - If a claim (issuer, audience, subject, etc.) is invalid.
 * @throws {JOSEError} - If signature verification fails or the JWT format is invalid.
 * @throws {TypeError} - If `jwk` is not a valid key or JWKS.
 *
 * @returns **JWT** Payload.
 */
export async function verifyJwtWithKey(
	ctx: GenericEndpointContext,
	jwt: string,
	jwk: string | CryptoKeyIdAlg,
	options?: VerifyJwtOptions,
): Promise<JWTPayload | null> {
	if (!jwt) return null;

	let privateKey = await getJwk(ctx, true, jwk);

	if (privateKey === undefined)
		throw new BetterAuthError(
			`Failed to sign JWT: Could not find a JWK with provided ID: "${jwk}"`,
		);

	const { payload, protectedHeader } = await verifyJwtJose(
		ctx,
		jwt,
		privateKey.key,
		options,
	);

	if (protectedHeader.kid !== privateKey.id) {
		if (options?.allowNoKeyId && protectedHeader.kid === undefined)
			return payload;

		throw new BetterAuthError(
			`JWT has invalid "kid" field in the protected header ("${protectedHeader.kid}" !== "${privateKey.id}")`,
			jwt,
		);
	}
	return payload;
}
