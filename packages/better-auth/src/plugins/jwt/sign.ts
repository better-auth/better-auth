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
 * Signs an arbitrary payload in the **JWT** format.
 *
 * ⓘ **Internal use only**: This function is not exported.
 *
 * @description
 *
 * 🔑 `jwk` can be either:
 * - An **ID** ({`string`}) referencing a {@link JWK **JWK**} in the **JWKS**.
 * - An **external key** ({`CryptoKeyExtended`}) provided directly. If `id` is `undefined`, no **"kid" (Key ID)** field will be included in the **JWT Header**.
 *
 * If `jwk` is **omited**, the **default JWK** will be used - either the `jwks.defaultKeyId` from the current **"jwt" plugin configuration** ({@link JwtPluginOptions}), or, if `defaultKeyId` is `undefined`, the **latest JWK** in the **database** (created automatically if none exists).
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param payload - The payload to sign. Can include the **JWT**-specific fields like `exp` or `aud`.
 * @param keyChain - *Not implemented yet*.
 * @param jwk - The **ID** ({`string`}) of the **private JWK** in **JWKS** or the **private key** ({`CryptoKeyExtended`}).
 * @param skipClaims - A list of {`boolean`}s that tell which **JWT Claims** should not be set to the default values.
 * @param customType - Sets **"typ" (Type) JWT Protecter Header Parameter**.
 *
 * @throws {`SyntaxError`} - If the {@link JWK **JWK**} cannot be parsed as **JSON**.
 * @throws {`BetterAuthError`} - If {@link JWK **JWK**} is **revoked** or its **JWK algorithm** is **invalid**.
 * @throws {`JOSEError`} - If *JOSE* `signJWT`/`importJWK` failed.
 * @throws {`JOSENotSupported`} - If {@link JWK **JWK**} is invalid for *JOSE* `importJWK`. Subclass of {`JOSEError`}.
 * @throws {`Error`} - If **private JWK encryption** or **database insertion** failed when creating a new {@link JWK **JWK**} (`jwk` is `undefined` and the **database** was empty). Exact type depends on the **database**.
 *
 * @returns Signed **JWT**.
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
		jwk ?? pluginOpts?.jwks?.defaultKeyId,
		true,
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
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`. It may be called before the **"jwt" plugin** is initialized - in such cases, `getJwtPluginOptions` cannot access the **"jwt" plugin configuration**, so `pluginOpts` must be provided directly.
 *
 * @description Converts the provided `data` into a **JWT payload** and signs it using the {@link JWK **JWK**}.
 *
 * 🔑 `jwk` can be either:
 * - An **ID** ({`string`}) referencing a {@link JWK **JWK**} in the **JWKS**.
 * - An **external key** ({`CryptoKeyExtended`}) provided directly. If `id` is `undefined`, no **"kid" (Key ID)** field will be included in the **JWT Header**.
 *
 * If `jwk` is **omited**, the **default JWK** will be used - either the `jwks.defaultKeyId` from the current **"jwt" plugin configuration** ({@link JwtPluginOptions}), or, if `defaultKeyId` is `undefined`, the **latest JWK** in the **database** (created automatically if none exists).
 *
 * ⚠ Any standard **JWT claims** (`aud`, `exp`, `iat`, `iss`, `jti`, `nbf`, `sub`) present in `data` will be **omitted** to prevent malicious manipulation. Instead, use `options.claims` to **set** or **override JWT Claims**. **JWT `iss` ("Issuer") Claim cannot** be overwritten to enforce good practices.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param data - Arbitrary data to include in the **JWT Payload**. Any standard **JWT Claims** present here will be removed.
 * @param options.keyChain - *Not implemented yet*.
 * @param options.jwk - The **ID** ({`string`}) of the **private JWK** in **JWKS** or the **private key** ({`CryptoKeyExtended`}).
 * @param options.claims - **JWT Claims** to set or override (`aud`, `exp`, `iat`, `jti`, `nbf`, `sub`). `iss` cannot be overridden.
 *
 * @throws {`SyntaxError`} - If the {@link JWK **JWK**} cannot be parsed as **JSON**.
 * @throws {`BetterAuthError`} - If {@link JWK **JWK**} is **revoked** or its **JWK algorithm** is **invalid**.
 * @throws {`JOSEError`} - If *JOSE* `signJWT`/`importJWK` failed.
 * @throws {`JOSENotSupported`} - If {@link JWK **JWK**} is invalid for *JOSE* `importJWK`. Subclass of {`JOSEError`}.
 * @throws {`Error`} - If **private JWK encryption** or **database insertion** failed when creating a new {@link JWK **JWK**} (`jwk` is `undefined` and the **database** was empty). Exact type depends on the **database**.
 *
 * @returns Signed **JWT**.
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
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`. It may be called before the **"jwt" plugin** is initialized - in such cases, `getJwtPluginOptions` cannot access the **"jwt" plugin configuration**, so `pluginOpts` must be provided directly.
 *
 * @description Converts `data` into a **JWT payload** and signs it using the {@link JWK **JWK**}.
 *
 * 🔑 `jwk` can be either:
 * - An **ID** ({`string`}) referencing a {@link JWK **JWK**} in the **JWKS**.
 * - An **external key** ({`CryptoKeyExtended`}) provided directly. If `id` is `undefined`, no **"kid" (Key ID)** field will be included in the **JWT Header**.
 *
 * If `jwk` is **omited**, the **default JWK** will be used - either the `jwks.defaultKeyId` from the current **"jwt" plugin configuration** ({@link JwtPluginOptions}), or, if `defaultKeyId` is `undefined`, the **latest JWK** in the **database** (created automatically if none exists).
 *
 * ⚠ Any standard **JWT claims** (`aud`, `exp`, `iat`, `iss`, `jti`, `nbf`, `sub`) present in `data` will be **omitted** to prevent malicious manipulation. Instead, use `options.claims` to **set** or **override JWT Claims**. **JWT `iss` ("Issuer") Claim cannot** be overwritten to enforce good practices.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param data - Arbitrary data to include in the **JWT Payload**. Any standard **JWT Claims** present here will be removed.
 * @param options.jwk - The **ID** ({`string`}) of the **private JWK** in **JWKS** or the **private key** ({`CryptoKeyExtended`}).
 * @param options.claims - **JWT Claims** to set or override (`aud`, `exp`, `iat`, `jti`, `nbf`, `sub`). `iss` cannot be overridden.
 *
 * @throws {`SyntaxError`} - If the {@link JWK **JWK**} cannot be parsed as **JSON**.
 * @throws {`BetterAuthError`} - If {@link JWK **JWK**} is **revoked** or its **JWK algorithm** is **invalid**.
 * @throws {`JOSEError`} - If *JOSE* `signJWT`/`importJWK` failed.
 * @throws {`JOSENotSupported`} - If {@link JWK **JWK**} is invalid for *JOSE* `importJWK`. Subclass of {`JOSEError`}.
 * @throws {`Error`} - If **private JWK encryption** or **database insertion** failed when creating a new {@link JWK **JWK**} (`jwk` is `undefined` and the **database** was empty). Exact type depends on the **database**.
 * @returns Signed **JWT**.
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
 * Creates and signs a **JSON Web Token (JWT)** containing the **session data**.
 *
 ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`. It may be called before the **"jwt" plugin** is initialized - in such cases, `getJwtPluginOptions` cannot access the **"jwt" plugin configuration**, so `pluginOpts` must be provided directly.
 *
 * @description Returns a **JWT** containing the result of `defineSessionJwtData` from the **"jwt" plugin configuration** ({@link JwtPluginOptions}). If `defineSessionJwtSubject` is `undefined`, `session.user` is used instead.
 *
 * ⚠︎ Any data conflicting with the standard **JWT Claims** (`aud`, `exp`, `iat`, `iss`, `jti`, `nbf`, `sub`) set by `defineSessionJwtData` or **custom session fields** will be **omited**.
 * 
 * The **JWT `sub` ("Subject") Claim** is determined by `defineSessionJwtSubject` from the **"jwt" plugin configuration** ({@link JwtPluginOptions}). If `defineSessionJwtSubject` is `undefined`, `session.user.id` is used instead.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param keyChain - *Not implemented yet*. 
 * @param jwk - The **ID** ({`string`}) of the **private JWK** in **JWKS** or the **private key** ({`CryptoKeyExtended`}).
 *
 * @throws {`SyntaxError`} - If the {@link JWK **JWK**} cannot be parsed as **JSON**.
 * @throws {`BetterAuthError`} - If {@link JWK **JWK**} is **revoked** or its **JWK algorithm** is **invalid**.
 * @throws {`JOSEError`} - If *JOSE* `signJWT`/`importJWK` failed.
 * @throws {`JOSENotSupported`} - If {@link JWK **JWK**} is invalid for *JOSE* `importJWK`. Subclass of {`JOSEError`}.
 * @throws {`Error`} - If **private JWK encryption** or **database insertion** failed when creating a new {@link JWK **JWK**} (`jwk` is `undefined` and the **database** was empty). Exact type depends on the **database**.
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
 * @description Returns a **JWT** containing the result of `defineSessionJwtData` from the **"jwt" plugin configuration** ({@link JwtPluginOptions}). If `defineSessionJwtSubject` is `undefined`, `session.user` is used instead.
 *
 * ⚠︎ Any data conflicting with the standard **JWT Claims** (`aud`, `exp`, `iat`, `iss`, `jti`, `nbf`, `sub`) set by `defineSessionJwtData` or **custom session fields** will be **omited**.
 *
 * The **JWT `sub` ("Subject") Claim** is determined by `defineSessionJwtSubject` from the **"jwt" plugin configuration** ({@link JwtPluginOptions}). If `defineSessionJwtSubject` is `undefined`, `session.user.id` is used instead.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param options.jwk - The **ID** ({`string`}) of the {@link JWK **JWK**} or the **private key** ({`CryptoKeyExtended`}). If **omited**, the **latest JWK** will be used. If `id` in the **private key** is not provided, there will be no **JWT "kid" (Key ID) Header Parameter** in the **JWT Header**.
 *
 * @throws {SyntaxError} - If the **key** cannot be parsed as **JSON**.
 * @throws {BetterAuthError} - If a **key ID** ({`string`}) is provided but **not found**.
 * @throws {JOSEError} - If the **JWT** signing failed.
 * @throws {Error} - If the `defineSessionJwtData` or `defineSessionJwtSubject` callbacks throw.
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
