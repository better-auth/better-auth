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
 * Verifies the **JWT** using *JOSE*. This is common code for `verifyJwt` and `verifyJwtWithKey`.
 *
 * ⓘ **Internal use only**: This function is not exported.
 *
 * @description This function ensures that the **JWT signature** is **valid** and the **token** is **trustworthy**.
 *
 * 🔑 `jwk` can be either:
 * - A **public key** {`CryptoKey`}.
 * - A **JSON Web Key Set (JWKS) resolver** {`JWTVerifyGetKey`}.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param jwt - The **JWT** to verify.
 * @param jwk - The {@link CryptoKey **public key**} or a **JSON Web Key Set (JWKS) resolver** ({`JWTVerifyGetKey`}).
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time.
 *
 * @throws {`JOSEError`} - If the **JWT signature** verification has failed or the **JWT format** is **invalid**.
 * @throws {`JWTExpired`} - If the **JWT** has **expired**. Subclass of {`JOSEError`}.
 * @throws {`JWTClaimValidationFailed`} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid. Subclass of {`JOSEError`}.
 *
 * @returns The **JWT Payload** and its **Protected Header**.
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
 * Verifies the **JWT**. Makes sure the {@link JWK **JWK**} used is **not revoked**.
 *
 * ⓘ **Internal use only**: This function is not exported.
 *
 * @description Determines which {@link JWK **JWK**} to use based on the **JWT "kty" (Key Type) Header Parameter** and **JWT (Key ID) JWT Header** fields. Throws an **error** if its **ID** ends with `revokedTag` (`" revoked"`).
 *
 * This function ensures that the **JWT signature** is **valid** and the **token** is **trustworthy**.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param jwt - The **JWT** to verify.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {`BetterAuthError`} - If tried to verify the **JWT** using a **revoked JWK**.
 * @throws {`JOSEError`} - If the **JWT signature** verification has failed or the **JWT format** is **invalid**.
 * @throws {`JWTExpired`} - If the **JWT** has **expired**. Subclass of {`JOSEError`}.
 * @throws {`JWTClaimValidationFailed`} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid. Subclass of {`JOSEError`}.
 *
 * @todo Check if the **JWT** is revoked, not only the {@link JWK **JWK**}.
 *
 * @returns The **JWT Payload** and its **Protected Header**.
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
 * Verifies the **JWT**. 
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`. It may be called before the **"jwt" plugin** is initialized - in such cases, `getJwtPluginOptions` cannot access the **"jwt" plugin configuration**, so `pluginOpts` must be provided directly.

 * @description Determines which {@link JWK **JWK**} to use based on the **JWT "kty" (Key Type) Header Parameter** and **JWT (Key ID) JWT Header** fields.
 *
 * This function ensures that the **JWT signature** is **valid** and the **token** is **trustworthy**.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param jwt - The **JWT** to verify.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {`BetterAuthError`} - If tried to verify the **JWT** using a **revoked JWK**.
 * @throws {`JOSEError`} - If the **JWT signature** verification has failed or the **JWT format** is **invalid**.
 * @throws {`JWTExpired`} - If the **JWT** has **expired**. Subclass of {`JOSEError`}.
 * @throws {`JWTClaimValidationFailed`} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid. Subclass of {`JOSEError`}.
 * 
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
 * Verifies the **JWT**.
 *
 * @description Determines which {@link JWK **JWK**} to use based on the **JWT "kty" (Key Type) Header Parameter** and **JWT (Key ID) JWT Header** fields.
 *
 * This function ensures that the **JWT signature** is **valid** and the **token** is **trustworthy**.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param jwt - The **JWT** to verify.
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {`BetterAuthError`} - If tried to verify the **JWT** using a **revoked JWK**.
 * @throws {`JOSEError`} - If the **JWT signature** verification has failed or the **JWT format** is **invalid**.
 * @throws {`JWTExpired`} - If the **JWT** has **expired**. Subclass of {`JOSEError`}.
 * @throws {`JWTClaimValidationFailed`} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid. Subclass of {`JOSEError`}.
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
 * Verifies the **JWT** with the provided {@link JWK **JWK**}.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`. It may be called before the **"jwt" plugin** is initialized - in such cases, `getJwtPluginOptions` cannot access the **"jwt" plugin configuration**, so `pluginOpts` must be provided directly.
 *
 * @description This function ensures that the **JWT signature** is **valid** and the **token** is **trustworthy**.
 *
 * 🔑 `jwk` can be either:
 * - An **ID** ({`string`}) referencing a {@link JWK **JWK**} in the **JWKS**.
 * - An **external key** ({`CryptoKeyExtended`}) provided directly. If `id` is `undefined`, the **JWT "kid" (Key ID) Header Parameter** will not be checked in the **JWT Header**.
 *
 * If `jwk` is **omited**, the **default JWK** will be used - either `jwks.defaultKeyId` from the current **"jwt" plugin configuration** ({@link JwtPluginOptions}), or, if `defaultKeyId` is `undefined`, the **latest JWK** in the database (created automatically if none exists).
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param jwt - The **JWT** to verify.
 * @param jwk - The **ID** ({`string`}) of the {@link JWK **JWK**} or the **public key** ({`CryptoKeyExtended`}).
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {`BetterAuthError`} - If tried to verify the **JWT** using a **revoked key** or the **key** was **not found**.
 * @throws {`JOSEError`} - If the **JWT signature** verification has failed or the **JWT format** is **invalid**.
 * @throws {`JWTExpired`} - If the **JWT** has **expired**. Subclass of {`JOSEError`}.
 * @throws {`JWTClaimValidationFailed`} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid. Subclass of {`JOSEError`}.
 *
 * @returns **JWT Payload**.
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
 * Verifies the **JWT** with the {@link JWK **JWK**}.
 *
 * @description This function ensures that the **JWT signature** is **valid** and the **token** is **trustworthy**.
 *
 * 🔑 `jwk` can be either:
 * - An **ID** ({`string`}) referencing a {@link JWK **JWK**} in the **JWKS**.
 * - An **external key** ({`CryptoKeyExtended`}) provided directly. If `id` is `undefined`, the **JWT "kid" (Key ID) Header Parameter** will not be checked in the **JWT Header**.
 *
 * If `jwk` is **omited**, the **default JWK** will be used - either `jwks.defaultKeyId` from the current **"jwt" plugin configuration** ({@link JwtPluginOptions}), or, if `defaultKeyId` is `undefined`, the **latest JWK** in the database (created automatically if none exists).
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param jwt - The **JWT** to be verified.
 * @param jwk - The **ID** ({`string`}) of the {@link JWK **JWK**} or the **public key** ({`CryptoKeyExtended`}).
 * @param options - Verification options, including allowed issuers, audiences, subject, maximum expiration time, and type enforcement.
 *
 * @throws {`BetterAuthError`} - If tried to verify the **JWT** using a **revoked JWK** or the {@link JWK **JWK**} was **not found**.
 * @throws {`JOSEError`} - If the **JWT signature** verification has failed or the **JWT format** is **invalid**.
 * @throws {`JWTExpired`} - If the **JWT** has **expired**. Subclass of {`JOSEError`}.
 * @throws {`JWTClaimValidationFailed`} - If a **JWT Claim** (issuer, audience, subject, etc.) is invalid. Subclass of {`JOSEError`}.
 *
 * @returns **JWT Payload**.
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
