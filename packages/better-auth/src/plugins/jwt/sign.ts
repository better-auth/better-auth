import type { GenericEndpointContext } from "../../types";
import type {
	CryptoKeyIdAlg,
	CustomJwtClaims,
	JwtPluginOptions,
} from "./types";
import type { JWTPayload } from "jose";
import { BetterAuthError } from "../../error";
import { createJwkInternal, getJwk } from "./jwk";
import {
	decryptPrivateKey,
	getJwtPluginOptions,
	isPrivateKeyEncrypted,
	removeJwtClaims,
	toJwtTime,
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
 *
 * @throws {SyntaxError} - If a key (public or private) cannot be parsed as JSON.
 * @throws {Error} - If key retrieval (`getJwk`), creation (`createJwk`), or decryption fails.
 * @throws {TypeError} - If `SignJWT.sign` fails due to an invalid key or payload.
 *
 * @returns Signed JWT.
 */
async function signJwtPayload(
	ctx: GenericEndpointContext,
	payload: JWTPayload,
	pluginOpts?: JwtPluginOptions,
	jwk?: string | CryptoKeyIdAlg,
): Promise<string> {
	if (typeof jwk === "string" && jwk.endsWith(" revoked"))
		throw new BetterAuthError(
			`Failed to sign a JWT: Cannot sign the JWT using a revoked JWK with id "${jwk}"`,
			jwk,
		);
	let privateKey = await getJwk(ctx, true, jwk);
	if (!privateKey) {
		// This happens only if there are no JWKs in the database, so create one
		const newKey = await createJwkInternal(ctx, pluginOpts?.jwks);

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

	if (privateKey.id && privateKey.id.endsWith(" revoked"))
		throw new BetterAuthError(
			`Failed to sign a JWT: Cannot sign the JWT using a revoked JWK with id "${privateKey.id}"`,
			privateKey.id,
		);
	const jwt = new SignJWT(payload).setProtectedHeader({
		alg: privateKey.alg,
		kid: privateKey.id,
		typ: "JWT",
	});

	jwt.setIssuedAt(payload.iat);
	jwt.setIssuer(pluginOpts?.jwt?.issuer ?? ctx.context.options.baseURL!);
	jwt.setExpirationTime(
		payload.exp ?? pluginOpts?.jwt?.expirationTime ?? "15m",
	);
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
	data: Record<string, unknown>,
	pluginOpts?: JwtPluginOptions,
	options?: {
		jwk?: string | CryptoKeyIdAlg;
		claims?: CustomJwtClaims;
	},
): Promise<string> {
	// Make sure user did not set any of the #RFC7519 JWT Claims in the data and remove them if present
	removeJwtClaims(data, ctx.context.logger);

	const payload: JWTPayload = data;
	if (options?.claims?.aud) payload.aud = options.claims.aud;
	if (options?.claims?.exp) payload.exp = toJwtTime(options.claims.exp);
	if (options?.claims?.iat) {
		const iat = toJwtTime(options.claims.iat);
		const allowedClockSkew: number = pluginOpts?.jwt?.allowedClockSkew ?? 60;
		const now = Math.floor(new Date().getTime() / 1000);
		if (iat > now + allowedClockSkew)
			throw new BetterAuthError(
				`Requested "Issued At" Claim is in the future ${iat} > ${now} and it exceeds allowed leeway of ${allowedClockSkew} seconds`,
				iat.toString(),
			);
		payload.iat = iat;
	}
	if (options?.claims?.jti) payload.jti = options.claims.jti;
	if (options?.claims?.nbf) payload.nbf = toJwtTime(options.claims.nbf);
	if (options?.claims?.sub) payload.sub = options.claims.sub;

	return await signJwtPayload(ctx, payload, pluginOpts, options?.jwk);
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
		jwk?: string | CryptoKeyIdAlg;
		claims?: CustomJwtClaims;
	},
): Promise<string> {
	return await signJwtInternal(
		ctx,
		data,
		getJwtPluginOptions(ctx.context),
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
	pluginOpts?: JwtPluginOptions,
	jwk?: string | CryptoKeyIdAlg,
): Promise<string> {
	const session = ctx.context.session!;

	const payload: JWTPayload = pluginOpts?.jwt?.defineSessionJwtData
		? await pluginOpts?.jwt?.defineSessionJwtData(session)
		: session.user;

	removeJwtClaims(payload, ctx.context.logger);

	payload.sub = pluginOpts?.jwt?.defineSessionJwtSubject
		? await pluginOpts?.jwt?.defineSessionJwtSubject(session)
		: session.user.id;

	return await signJwtPayload(ctx, payload, pluginOpts, jwk);
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
	jwk?: string | CryptoKeyIdAlg,
): Promise<string> {
	return getSessionJwtInternal(ctx, getJwtPluginOptions(ctx.context), jwk);
}
