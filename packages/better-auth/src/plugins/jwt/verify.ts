import type { GenericEndpointContext } from "@better-auth/core";
import type {
	JWTPayload,
	JWTVerifyGetKey,
	JWTVerifyOptions,
	JWTVerifyResult,
} from "jose";
import type {
	CryptoKeyIdAlg,
	JwtPluginOptions,
	JwtVerifyOptions,
} from "./types";
import { BetterAuthError } from "@better-auth/core/error";
import { getAllJwksInternal, getCachedJwks, getJwk } from "./jwk";
import { createLocalJWKSet, jwtVerify } from "jose";
import { getJwtPluginOptions, revokedTag } from "./utils";

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
 * @param pluginOpts - Plugin configuration.
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
	pluginOpts: JwtPluginOptions | undefined,
	jwt: string,
	jwk: CryptoKey | JWTVerifyGetKey,
	options?: JwtVerifyOptions,
): Promise<JWTVerifyResult<JWTPayload>> {
	const audiences = options?.allowedAudiences;
	// Set defaults, if some options are missing
	const parsedOptions: JWTVerifyOptions = {
		audience:
			audiences === null || (audiences && audiences.length === 0)
				? undefined
				: (audiences ?? [ctx.context.options.baseURL!]),
		clockTolerance:
			options?.maxClockSkew === null
				? undefined
				: (options?.maxClockSkew ?? pluginOpts?.jwt?.maxClockSkew ?? 30),
		issuer:
			options?.allowedIssuers === null ||
			(options?.allowedIssuers && options?.allowedIssuers.length === 0)
				? undefined
				: (options?.allowedIssuers ?? [ctx.context.options.baseURL!]),
		maxTokenAge:
			options?.maxTokenAge === null || options?.maxTokenAge?.trim() === ""
				? undefined
				: (options?.maxTokenAge ??
					pluginOpts?.jwt?.maxTokenAge ??
					(options?.requiredClaims === undefined ||
					(options?.requiredClaims && "iat" in options?.requiredClaims)
						? "1 week"
						: undefined)),
		subject: options?.expectedSubject,
		typ:
			options?.expectedType === null || options?.expectedType === ""
				? undefined
				: (options?.expectedType ?? "JWT"),
		requiredClaims:
			options?.requiredClaims === null
				? undefined
				: (options?.requiredClaims ?? ["aud", "exp", "iat", "iss"]), //? ["aud", "exp", "iat", "iss", "jti"] : //(pluginOpts?.enableJwtRevocation
	};
	// This check is needed to differentiate between function overloads
	if (jwk instanceof CryptoKey) return jwtVerify(jwt, jwk, parsedOptions);

	return jwtVerify(jwt, jwk, parsedOptions);
}

/**
 * @todo update thrown errors
 * Verifies a **JWT**. Determines which **JWK** to use from the database based on **JWT "kty" (Key Type) Header Parameter** and **JWT (Key ID) JWT Header** fields.
 *
 * ⓘ **Internal use only**: This function is not exported in `index.ts` and is intended for use inside the **JWT plugin endpoint**. It is called before the plugin is initialized, at which point `getJwtPluginOptions` cannot access the plugin configuration, so the options are passed directly.
 *
 * @param ctx - Endpoint context.
 * @param jwt - **JWT** to verify.
 * @param pluginOpts - Plugin configuration.
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
export async function verifyJwtInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	jwt: string,
	options?: JwtVerifyOptions,
): Promise<JWTPayload> {
	const jwks = pluginOpts?.jwks?.disableJwksCaching
		? await getAllJwksInternal(ctx, pluginOpts)
		: await getCachedJwks(ctx, pluginOpts);
	const localJwks = createLocalJWKSet(jwks);

	try {
		const { payload, protectedHeader } = await verifyJwtJose(
			ctx,
			pluginOpts,
			jwt,
			localJwks,
			options,
		);

		if (protectedHeader.kid?.endsWith(revokedTag))
			throw new BetterAuthError(
				`Failed to verify the JWT: Cannot verify the JWT using a revoked JWK with ID "${protectedHeader.kid}"`,
				protectedHeader.kid,
			);
		return payload;
	} catch (error: unknown) {
		// This is not an error, verification failure is often nothing unexpected
		if (options?.logFailure === undefined || options?.logFailure)
			ctx.context.logger.info(`Failed to verify the JWT: ${error}"`);
		throw error;
	}
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
	options?: JwtVerifyOptions,
): Promise<JWTPayload> {
	return verifyJwtInternal(ctx, getJwtPluginOptions(ctx.context), jwt, options);
}

/**
 * Verifies **JWT** with provided key and options.
 *
 * ⓘ **Internal use only**: This function is not exported in `index.ts` and is intended for use inside the **JWT plugin endpoint**. It is called before the plugin is initialized, at which point `getJwtPluginOptions` cannot access the plugin configuration, so the options are passed directly.
 *
 * @description Uses `jwk` **public key**, can be an external one or an ID of one in the **JWKS**.
 *
 * @param ctx - Endpoint context.
 * @param jwt - **JWT** to be verified.
 * @param jwk - **ID** of the key in the database or the **public key** itself. If omitted, **latest JWK** will be used. If `id` in the **public key** is not provided, the **"kid" (Key ID) Field** will not be checked in the **JWT Protected Header**.
 * @param pluginOpts - Plugin configuration.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {JWTExpired} - If the token is expired.
 * @throws {JWTClaimValidationFailed} - If a claim (issuer, audience, subject, etc.) is invalid.
 * @throws {JOSEError} - If signature verification fails or the JWT format is invalid.
 * @throws {TypeError} - If `jwk` is not a valid key or JWKS.
 *
 * @returns **JWT** Payload.
 */
export async function verifyJwtWithKeyInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	jwt: string,
	jwk: string | CryptoKeyIdAlg,
	options?: JwtVerifyOptions,
): Promise<JWTPayload | null> {
	if (!jwt) return null;

	if (typeof jwk === "string" && jwk?.endsWith(revokedTag))
		throw new BetterAuthError(
			`Failed to verify the JWT: Cannot verify the JWT using a revoked JWK with ID "${jwk}"`,
			jwk,
		);
	let publicKey = await getJwk(ctx, false, jwk);

	if (publicKey === undefined)
		throw new BetterAuthError(
			`Failed to verify the JWT: Could not find a JWK with ID "${jwk}"`,
		);

	const { payload, protectedHeader } = await verifyJwtJose(
		ctx,
		pluginOpts,
		jwt,
		publicKey.key,
		options,
	);

	if (protectedHeader.kid !== publicKey.id) {
		if (options?.allowNoKeyId && protectedHeader.kid === undefined)
			return payload;

		throw new BetterAuthError(
			`Failed to verify the JWT: invalid "kid" field in the protected header ("${protectedHeader.kid}" !== "${publicKey.id}")`,
			jwt,
		);
	}
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
	options?: JwtVerifyOptions,
): Promise<JWTPayload | null> {
	return verifyJwtWithKeyInternal(
		ctx,
		getJwtPluginOptions(ctx.context),
		jwt,
		jwk,
		options,
	);
}
