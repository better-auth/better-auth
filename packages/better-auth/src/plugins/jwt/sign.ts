import type { GenericEndpointContext } from "@better-auth/core";
import type {
	CryptoKeyIdAlg,
	JwtCustomClaims,
	JwtPluginOptions,
} from "./types";
import type { JWTPayload } from "jose";
import { BetterAuthError } from "@better-auth/core/error";
import { createJwkInternal, getJwkInternal } from "./jwk";
import {
	decryptPrivateKey,
	getJwtPluginOptions,
	isPrivateKeyEncrypted,
	withoutJwtClaims,
	toJwtTime,
	revokedTag,
} from "./utils";
import { importJWK, SignJWT } from "jose";

/**
 * Signs a payload in **JWT** format.
 *
 * ⓘ **Internal use only**: This function is not exported in `index.ts` and is intended for use inside the **JWT plugin endpoint**. It is called before the plugin is initialized, at which point `getJwtPluginOptions` cannot access the plugin configuration, so the options are passed directly.
 *
 * @param ctx - Endpoint context.
 * @param payload - Payload to sign. Can include JWT-specific fields like `exp` or `aud`.
 * @param jwtOpts - JWT signing options (e.g. issuer, expiration time, audience).
 * @param jwk - **ID** of the key in the database or the **private key** itself. If omitted, **latest JWK** will be used. If `id` in the **private key** is not provided, there will be no **"kid" (Key ID) Field** in the **JWT Protected Header**.
 * @param skipClaims @todo
 * @param customType @todo
 *
 * @throws {SyntaxError} - If a key (public or private) cannot be parsed as JSON.
 * @throws {Error} - If key retrieval (`getJwk`), creation (`createJwk`), or decryption fails.
 * @throws {TypeError} - If `SignJWT.sign` fails due to an invalid key or payload.
 *
 * @returns Signed JWT.
 */
async function signJwtPayload(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	payload: JWTPayload,
	keyChain?: never,
	jwk?: string | CryptoKeyIdAlg,
	skipClaims?: { aud?: boolean; iat?: boolean; iss?: boolean; exp?: boolean },
	customType?: string,
): Promise<string> {
	if (typeof jwk === "string" && jwk.endsWith(revokedTag))
		throw new BetterAuthError(
			`Failed to sign a JWT: Cannot sign the JWT using a revoked JWK with id "${jwk}"`,
			jwk,
		);

	let privateKey = await getJwkInternal(
		ctx,
		pluginOpts,
		true,
		jwk ?? pluginOpts?.jwks?.defaultKeyId,
	);

	if (!privateKey) {
		// This happens only if there are no JWKs in the database, so create one
		const newKey = await createJwkInternal(ctx, pluginOpts);

		const alg = JSON.parse(newKey.publicKey).alg;
		if (!alg)
			throw new BetterAuthError(
				"Failed to create a JWK: public key does not contain its algorithm name",
				newKey.publicKey,
			);

		const privateKeyJSON = JSON.parse(
			isPrivateKeyEncrypted(newKey.privateKey)
				? await decryptPrivateKey(ctx.context.secret, newKey.privateKey)
				: newKey.privateKey,
		);
		privateKey = {
			id: newKey.id,
			alg: alg,
			key: (await importJWK(privateKeyJSON, alg)) as CryptoKey,
		};
	}

	if (!privateKey.alg)
		throw new BetterAuthError(
			`Failed to sign a JWT: Cannot sign the JWT using a JWK without a specified algorithm name"`,
		);

	if (privateKey.id && privateKey.id.endsWith(revokedTag))
		throw new BetterAuthError(
			`Failed to sign a JWT: Cannot sign the JWT using a revoked JWK with an ID "${privateKey.id}"`,
			privateKey.id,
		);

	const jwt = new SignJWT(payload).setProtectedHeader({
		alg: privateKey.alg!,
		kid: privateKey.id,
		typ: customType === "" ? undefined : (customType ?? "JWT"),
	});

	if (!skipClaims?.iat) jwt.setIssuedAt(payload.iat);
	if (!skipClaims?.iss)
		jwt.setIssuer(pluginOpts?.jwt?.issuer ?? ctx.context.options.baseURL!);
	if (!skipClaims?.exp)
		jwt.setExpirationTime(
			payload.exp ?? pluginOpts?.jwt?.expirationTime ?? "15m",
		);
	if (!skipClaims?.aud)
		jwt.setAudience(
			payload.aud ?? pluginOpts?.jwt?.audience ?? ctx.context.options.baseURL!,
		);
	return await jwt.sign(privateKey.key);
}

/**
 * Signs arbitrary data in **JWT** format.
 *
 * @description Converts the provided `data` into a **JWT payload** and signs it using a **JWK**.
 * For security, any standard **JWT claims** (`aud`, `exp`, `iat`, `iss`, `jti`, `nbf`, `sub`) present in `data` will be **removed** to prevent malicious manipulation.
 * Optional `claims` can be provided to **set** or **override** certain **JWT Claims** instead.
 *
 * ⚠ Note: `iat` ("Issued At") and `iss` ("Issuer") Claims **cannot** be overwritten for security reasons.
 *
 * ⓘ **Internal use only**: This function is not exported in `index.ts` and is intended for use inside the **JWT plugin endpoint**. It is called before the plugin is initialized, at which point `getJwtPluginOptions` cannot access the plugin configuration, so the options are passed directly.
 *
 * @param ctx - Endpoint context.
 * @param data - Arbitrary data to include in the JWT payload. Any standard JWT claims present here will be removed.
 * @param pluginOpts - Plugin options.
 * @param options - Optional signing options.
 * @param options.jwk - **ID** of the key in the database or the **private key** itself. If omitted, **latest JWK** will be used. If `id` in the **private key** is not provided, there will be no **"kid" (Key ID) Field** in the **JWT Protected Header**.
 * @param options.claims - Optional JWT claims to set or override (`aud`, `exp`, `jti`, `nbf`, `sub`). `iat` and `iss` cannot be overridden.
 *
 * @throws {SyntaxError} - If a key (public or private) cannot be parsed as JSON.
 * @throws {BetterAuthError} - If a **key ID** is provided but not found in the database or `iat` ("Issued At" Claim) is set into future.
 * @throws {TypeError | JOSENotSupported} - If signing the JWT fails due to an invalid key or payload.
 *
 * @returns Signed JWT.
 */
export async function signJwtInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	data: Record<string, unknown>,
	options?: {
		keyChain?: never;
		jwk?: string | CryptoKeyIdAlg;
		claims?: JwtCustomClaims;
	},
): Promise<string> {
	const claims: JwtCustomClaims | undefined = options?.claims;
	// Make sure user did not set any of the #RFC7519 JWT Claims in the data and remove them if present

	const payload: JWTPayload = withoutJwtClaims(data, ctx.context.logger);

	const now = Math.floor(Date.now() / 1000);

	if (claims?.aud) payload.aud = claims.aud;
	if (claims?.exp) payload.exp = toJwtTime(claims.exp, now);
	if (claims?.iat) payload.iat = toJwtTime(claims.iat, now);
	if (claims?.jti) payload.jti = claims.jti;
	if (claims?.nbf) payload.nbf = toJwtTime(claims.nbf, now);
	if (claims?.sub) payload.sub = claims.sub;

	return await signJwtPayload(
		ctx,
		pluginOpts,
		payload,
		options?.keyChain,
		options?.jwk,
		{
			aud: claims?.aud === null,
			iat: claims?.iat === null,
			iss: claims?.iss === null,
			exp: claims?.exp === null,
		},
		claims?.typ === null ? "" : claims?.typ,
	);
}

/**
 * Signs arbitrary data in **JWT** format.
 *
 * @description Converts the provided `data` into a **JWT payload** and signs it using a **JWK**.
 * For security, any standard **JWT claims** (`aud`, `exp`, `iat`, `iss`, `jti`, `nbf`, `sub`) present in `data` will be **removed** to prevent malicious manipulation.
 * Optional `claims` can be provided to **set** or **override** certain **JWT Claims** instead.
 *
 * ⚠ Note: `iat` ("Issued At") and `iss` ("Issuer") Claims **cannot** be overwritten for security reasons.
 *
 * @param ctx - Endpoint context.
 * @param data - Arbitrary data to include in the JWT payload. Any standard JWT claims present here will be removed.
 * @param options - Optional signing options.
 * @param options.jwk - **ID** of the key in the database or the **private key** itself. If omitted, **latest JWK** will be used. If `id` in the **private key** is not provided, there will be no **"kid" (Key ID) Field** in the **JWT Protected Header**.
 * @param options.claims - Optional JWT claims to set or override (`aud`, `exp`, `jti`, `nbf`, `sub`). `iat` and `iss` cannot be overridden.
 *
 * @throws {SyntaxError} - If a key (public or private) cannot be parsed as JSON.
 * @throws {BetterAuthError} - If a **key ID** is provided but not found in the database.
 * @throws {TypeError | JOSENotSupported} - If signing the JWT fails due to an invalid key or payload.
 *
 * @returns Signed JWT.
 */
export async function signJwt(
	ctx: GenericEndpointContext,
	data: Record<string, unknown>,
	options?: {
		//keyChain?: never;
		jwk?: string | CryptoKeyIdAlg;
		claims?: JwtCustomClaims;
	},
): Promise<string> {
	return await signJwtInternal(
		ctx,
		getJwtPluginOptions(ctx.context),
		data,
		options,
	);
}

/**
 * Creates and signs a **JSON Web Token (JWT)** containing **session data**.
 *
 * ⓘ **Internal use only**: This function is not exported in `index.ts` and is intended for use inside the **JWT plugin endpoint**. It is called before the plugin is initialized, at which point `getJwtPluginOptions` cannot access the plugin configuration, so the options are passed directly.
 *
 * @description Returns a **JWT** containing the result of `defineSessionJwtData` from **plugin configuration**, or `session.user` if `defineSessionJwtData` is `undefined`.
 * The **JWT `sub` ("Subject" Claim)** is determined by `defineSessionJwtSubject` from **plugin configuration**, or `session.user.id` if `defineSessionJwtSubject` is `undefined`.
 *
 * ⚠︎ Any standard **JWT Claims** (`aud`, `exp`, `iat`, `iss`, `jti`, `nbf`, `sub`) set by `defineSessionJwtData` or *custom session fields* will be overwritten or removed by this function.
 *
 * @param ctx - Endpoint context.
 * @param pluginOpts - Plugin options.
 * @param jwk - **ID** of the key in the database or the **private key** itself. If omitted, **latest JWK** will be used. If `id` in the **private key** is not provided, there will be no **"kid" (Key ID) Field** in the **JWT Protected Header**.
 *
 * @throws {SyntaxError} - If a key (public or private) cannot be parsed as JSON.
 * @throws {BetterAuthError} - If a **key ID** is provided but not found in the database.
 * @throws {TypeError | JOSENotSupported} - If signing the JWT fails due to an invalid key or payload.
 * @throws {Error} - If `defineSessionJwtData` or `defineSessionJwtSubject` callbacks throw.
 *
 * @returns A signed **JWT** containing **session data**.
 */
export async function getSessionJwtInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	keyChain?: never,
	jwk?: string | CryptoKeyIdAlg,
): Promise<string> {
	const session = ctx.context.session!;

	const payload: JWTPayload = pluginOpts?.jwt?.defineSessionJwtData
		? await pluginOpts?.jwt?.defineSessionJwtData(session)
		: session.user;

	const sanitizedPayload = withoutJwtClaims(payload, ctx.context.logger);

	sanitizedPayload.sub = pluginOpts?.jwt?.defineSessionJwtSubject
		? await pluginOpts?.jwt?.defineSessionJwtSubject(session)
		: session.user.id;

	return await signJwtPayload(ctx, pluginOpts, sanitizedPayload, keyChain, jwk);
}

/**
 * Creates and signs a **JSON Web Token (JWT)** containing **session data**.
 *
 * @description Returns a **JWT** containing the result of `defineSessionJwtData` from **plugin configuration**, or `session.user` if `defineSessionJwtData` is `undefined`.
 * The **JWT `sub` ("Subject" Claim)** is determined by `defineSessionJwtSubject` from **plugin configuration**, or `session.user.id` if `defineSessionJwtSubject` is `undefined`.
 *
 * ⚠︎ Any standard **JWT Claims** (`aud`, `exp`, `iat`, `iss`, `jti`, `nbf`, `sub`) set by `defineSessionJwtData` or *custom session fields* will be overwritten or removed by this function.
 *
 * @param ctx - Endpoint context.
 * @param jwk - **ID** of the key in the database or the **private key** itself. If omitted, **latest JWK** will be used. If `id` in the **private key** is not provided, there will be no **"kid" (Key ID) Field** in the **JWT Protected Header**.
 *
 * @throws {SyntaxError} - If a key (public or private) cannot be parsed as JSON.
 * @throws {BetterAuthError} - If a **key ID** is provided but not found in the database.
 * @throws {TypeError | JOSENotSupported} - If signing the JWT fails due to an invalid key or payload.
 * @throws {Error} - If `defineSessionJwtData` or `defineSessionJwtSubject` callbacks throw.
 *
 * @returns A signed **JWT** containing **session data**.
 */
export async function getSessionJwt(
	ctx: GenericEndpointContext,
	options?: {
		//keyChain?: never;
		jwk?: string | CryptoKeyIdAlg;
	},
): Promise<string> {
	return getSessionJwtInternal(
		ctx,
		getJwtPluginOptions(ctx.context),
		undefined, //options?.keyChain,
		options?.jwk,
	);
}
