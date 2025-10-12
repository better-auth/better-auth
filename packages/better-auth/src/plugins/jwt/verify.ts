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
 * Verifies the **JWT** using *JOSE*. Common code for `verifyJWT` and `verifyJWTWithKey`.
 *
 * ⓘ **Internal use only**: This function is not exported.
 *
 * @description `jwk` is a **public key** {`CryptoKey`} or a **JSON Web Key Set (JWKS) resolver** {`JWTVerifyGetKey`} used to verify the **JWT**.
 *
 * @param ctx - Endpoint context.
 * @param pluginOpts - Plugin configuration.
 * @param jwt - The **JWT** to verify.
 * @param jwk - A **public key** or a **JSON Web Key Set (JWKS) resolver**.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time.
 *
 * @throws {JOSEError} - If signature verification fails or the **JWT** format is invalid.
 * @throws {JWTExpired} - If the token has **expired**.
 * @throws {JWTClaimValidationFailed} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid.
 * @throws {TypeError} - If `jwk` is invalid.
 *
 * @returns **JWT Payload** and its **Protected Header**.
 */
async function verifyJwtJose(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	jwt: string,
	jwk: CryptoKey | JWTVerifyGetKey,
	options?: JwtVerifyOptions,
): Promise<JWTVerifyResult<JWTPayload>> {
	const audiences = options?.allowedAudiences;
	// Sets defaults, if some options are missing and sets an option to undefined if it is null/empty
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
 * Verifies the **JWT**. Determines which **JWK** to use based on the **JWT "kty" (Key Type) Header Parameter** and **JWT (Key ID) JWT Header** fields. Makes sure the key used is not revoked.
 *
 * ⓘ **Internal use only**: This function is not exported.
 *
 * @param ctx - Endpoint context.
 * @param pluginOpts - Plugin configuration.
 * @param jwt - The **JWT** to verify.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {BetterAuthError} - If tried to verify the **JWT** using a **revoked key**.
 * @throws {JOSEError} - If signature verification fails or the **JWT** format is invalid.
 * @throws {JWTExpired} - If the token has **expired**.
 * @throws {JWTClaimValidationFailed} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid.
 * @throws {TypeError} - If `jwk` is invalid.
 *
 * @todo Check if **JWT** is revoked, not only **JWK**.
 *
 * @returns **JWT Payload** and its **Protected Header**.
 */
async function verifyJwtUnrevoked(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	jwt: string,
	jwk: CryptoKey | JWTVerifyGetKey,
	options?: JwtVerifyOptions,
): Promise<JWTPayload> {
	try {
		const { payload, protectedHeader } = await verifyJwtJose(
			ctx,
			pluginOpts,
			jwt,
			jwk,
			options,
		);

		if (protectedHeader.kid?.endsWith(revokedTag))
			throw new BetterAuthError(
				`Failed to verify the JWT: Cannot verify the JWT using a revoked JWK with ID "${protectedHeader.kid}"`,
				protectedHeader.kid,
			);
		return payload;
	} catch (error: unknown) {
		const logFailure =
			options?.logFailure ?? pluginOpts?.jwt?.logFailure ?? true;
		// This is not an error, verification failure is often nothing unexpected
		if (logFailure) {
			if (error instanceof BetterAuthError) ctx.context.logger.info("", error);
			else ctx.context.logger.info("Failed to verify the JWT: error", error);
		}
		throw error;
	}
}

/**
 * Verifies the **JWT**. Determines which **JWK** to use based on the **JWT "kty" (Key Type) Header Parameter** and **JWT (Key ID) JWT Header** fields.
 *
 * ⓘ **Internal use only**: This function is not exported in `index.ts` and is intended for use inside the **JWT plugin endpoint**. It is called before the plugin is initialized, at which point `getJwtPluginOptions` cannot access the plugin configuration, so the options are passed directly.
 *
 * @param ctx - Endpoint context.
 * @param pluginOpts - Plugin configuration.
 * @param jwt - The **JWT** to verify.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {BetterAuthError} - If tried to verify the **JWT** using a **revoked key**.
 * @throws {JOSEError} - If signature verification fails or the **JWT** format is invalid.
 * @throws {JWTExpired} - If the token has **expired**.
 * @throws {JWTClaimValidationFailed} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid.
 * @throws {TypeError} - If `jwk` is invalid.
 * @returns **JWT Payload**.
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

	return verifyJwtUnrevoked(ctx, pluginOpts, jwt, localJwks, options);
}

/**
 * Verifies the **JWT**. Determines which **JWK** to use based on the **JWT "kty" (Key Type) Header Parameter** and **JWT (Key ID) JWT Header** fields.
 *
 * @param ctx - Endpoint context.
 * @param jwt - The **JWT** to verify.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {BetterAuthError} - If tried to verify the **JWT** using a **revoked key**.
 * @throws {JOSEError} - If signature verification fails or the **JWT** format is invalid.
 * @throws {JWTExpired} - If the token has **expired**.
 * @throws {JWTClaimValidationFailed} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid.
 * @throws {TypeError} - If `jwk` is invalid.
 *
 * @returns **JWT Payload**.
 */
export async function verifyJwt(
	ctx: GenericEndpointContext,
	jwt: string,
	options?: JwtVerifyOptions,
): Promise<JWTPayload> {
	return verifyJwtInternal(ctx, getJwtPluginOptions(ctx.context), jwt, options);
}

/**
 * Verifies the **JWT** with the provided **JWK**.
 *
 * ⓘ **Internal use only**: This function is not exported in `index.ts` and is intended for use inside the **JWT plugin endpoint**. It is called before the plugin is initialized, at which point `getJwtPluginOptions` cannot access the plugin configuration, so the options are passed directly.
 *
 * @description Uses a **public JWK**, that can be either an external one {`CryptoKeyIdAlg`} or an **ID** {`string`} of one in the **JWKS**.
 *
 * @param ctx - Endpoint context.
 * @param pluginOpts - Plugin configuration.
 * @param jwt - The **JWT** to verify.
 * @param jwk - **ID** of the key {`string`} or the **public key** itself {`CryptoKeyIdAlg`}. If omitted, the **latest JWK** will be used. If `id` in the **public key** is not provided, the **"kid" (Key ID) Field** will not be checked in the **JWT Protected Header**.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {BetterAuthError} - If tried to verify the **JWT** using a **revoked key** or the **key** was **not found**.
 * @throws {JOSEError} - If signature verification fails or the **JWT** format is invalid.
 * @throws {JWTExpired} - If the token has **expired**.
 * @throws {JWTClaimValidationFailed} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid.
 * @throws {TypeError} - If `jwk` is invalid.
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
	let publicKey = await getJwk(ctx, jwk, false);

	if (publicKey === undefined)
		throw new BetterAuthError(
			`Failed to verify the JWT: Could not find a JWK with ID "${jwk}"`,
		);

	return verifyJwtUnrevoked(ctx, pluginOpts, jwt, publicKey.key, options);
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
 * @throws {BetterAuthError} - If tried to verify the **JWT** using a **revoked key** or the **key** was **not found**.
 * @throws {JOSEError} - If signature verification fails or the **JWT** format is invalid.
 * @throws {JWTExpired} - If the token has **expired**.
 * @throws {JWTClaimValidationFailed} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid.
 * @throws {TypeError} - If `jwk` is invalid.
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
