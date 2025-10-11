import type { GenericEndpointContext } from "@better-auth/core";
import type {
	CryptoKeyIdAlg,
	Jwk,
	JwkAlgorithm,
	JwkCache,
	JwkOptions,
	JwksCache,
	JwtPluginOptions,
} from "./types";
import type { JSONWebKeySet, JWK } from "jose";
import { BetterAuthError } from "@better-auth/core/error";
import { getJwksAdapter } from "./adapter";
import {
	decryptPrivateKey,
	ensureProperEncryption,
	getJwtPluginOptions,
	getPublicJwk,
	isPrivateKeyEncrypted,
	isPublicKey,
	revokedTag,
} from "./utils";
import { exportJWK, generateKeyPair, importJWK } from "jose";

const jwksCache: JwksCache = {
	keys: [],
	remoteKeys: [],
	jwks: { keys: [] },
	cachedAt: new Date(),
};

/**
 * Generates a new **JSON Web Key (JWK) pair** in a serializable format.
 *
 * @param jwkOpts - Configuration for the key pair (algorithm, curve, etc.)
 *
 * @throws {TypeError} - If the key generation parameters are invalid.
 * @throws {JOSENotSupported} - If the algorithm or curve is not supported.
 *
 * @returns An object containing:
 * - `publicKey`: The exported **public JWK**
 * - `privateKey`: The exported **private JWK**
 */
export async function generateExportedKeyPair(
	jwkOpts?: JwkOptions,
): Promise<{ publicKey: JWK; privateKey: JWK }> {
	const { alg, ...cfg } = jwkOpts ?? {
		alg: "EdDSA",
		crv: "Ed25519",
	};

	const keyPairConfig = {
		extractable: true,
		...cfg,
	};

	const { publicKey, privateKey } = await generateKeyPair(alg, keyPairConfig);

	const publicWebKey = await exportJWK(publicKey);
	const privateWebKey = await exportJWK(privateKey);

	publicWebKey.alg = alg;
	privateWebKey.alg = alg;

	return { publicKey: publicWebKey, privateKey: privateWebKey };
}

async function getKeySet(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	jwk?: string,
): Promise<JwkCache | undefined> {
	if (pluginOpts?.jwks?.disableJwksCaching) {
		if (jwk === undefined) {
			const fetchedKey = await getJwksAdapter(
				ctx.context.adapter,
			).getLatestKey();
			if (!fetchedKey) return undefined;
			return {
				...fetchedKey,
				publicKey: JSON.parse(fetchedKey?.publicKey),
			};
		} else {
			const { keys: keysRaw, remoteKeys: remoteKeysRaw } =
				await getAllKeys(ctx);
			const { keys, remoteKeys } = await parseAllKeys(
				ctx,
				pluginOpts,
				keysRaw,
				remoteKeysRaw,
			);
			return (
				keys.find((key) => key.id === jwk) ??
				remoteKeys.find((key) => key.id === jwk)
			);
		}
	} else {
		const cachedKey: JwkCache | undefined =
			jwk === undefined
				? jwksCache.keys.at(-1)
				: (jwksCache.keys.find((cachedJwk) => cachedJwk.id === jwk) ??
					jwksCache.remoteKeys.find(
						(cachedRemoteJwk) => cachedRemoteJwk.id === jwk,
					));
		if (!cachedKey) await updateCachedJwks(ctx, pluginOpts);
		else return cachedKey;

		return jwk === undefined
			? jwksCache.keys.at(-1)
			: (jwksCache.keys.find((cachedJwk) => cachedJwk.id === jwk) ??
					jwksCache.remoteKeys.find(
						(cachedRemoteJwk) => cachedRemoteJwk.id === jwk,
					));
	}
}

/**
 * Returns a **private** or **public key** as a {`CryptoKey`}.
 * @todo: correct this description
 * @description
 * - If `jwk` is a {`CryptoKeyWithId`}, returns it directly.
 * - If `jwk` is a {`string`}, treats it as a **key ID** and fetches it from the database. If the key is not found, throws {`BetterAuthError`}.
 * - If `jwk` is **`undefined`**, returns the **latest key** from the database. Returns `undefined` if the database is **empty**.
 *
 * @param ctx - Endpoint context.
 * @param isPrivate - Whether to return the **private key** or the **public key**.
 * @param jwk - Optional. Either a **key ID** ({`string`}) or a {`CryptoKeyWithId`} object containing a {`CryptoKey`} and an optional `id` field to uniquely identify external keys.
 *
 * @throws {BetterAuthError} - If a **key ID** is provided but not found in the database.
 * @throws {TypeError | JOSENotSupported} - If `importJWK` fails due to **invalid key**.
 *
 * @returns An object containing:
 * - `keyId` — the **key ID** in the database or `undefined` if it's an external key without manually assigned **ID**
 * - `key` — the key: `CryptoKey` instance or `undefined` if the database is empty
 * - `alg` — the algorithm name or `undefined` if the database is empty
 */
export async function getJwkInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	isPrivate: boolean,
	jwk?: string | CryptoKeyIdAlg,
): Promise<CryptoKeyIdAlg | undefined> {
	if (jwk !== undefined && typeof jwk !== "string") return jwk;

	let keyFromDb = await getKeySet(ctx, pluginOpts, jwk);

	if (!keyFromDb) {
		if (jwk !== undefined)
			// We are provided with keyId and we didn't find it in the database
			throw new BetterAuthError(
				`Failed to access the JWK: Could not find a JWK with provided ID: "${jwk}"`,
				jwk,
			);
		return undefined;
	}

	const alg = keyFromDb.publicKey.alg;
	if (!alg)
		throw new BetterAuthError(
			`Failed to access the JWK: the public key with ID "${keyFromDb.id}" does not contain its algorithm name`,
			keyFromDb.id,
		);
	/*
    if (!isJwkAlgValid(alg))
		throw new BetterAuthError(
			`Failed to access the JWK: the public key with ID "${keyFromDb.id}" has invalid algorithm name`,
			keyFromDb.id,
		);
    */

	if (isPrivate) {
		if (keyFromDb.privateKey.trim() === "")
			throw new BetterAuthError(
				`Failed to access the JWK: Tried to access a private key from a public-only entry with ID "${keyFromDb.id}"`,
				keyFromDb.id,
			);
		const privateKeyJSON = JSON.parse(
			isPrivateKeyEncrypted(keyFromDb.privateKey)
				? await decryptPrivateKey(ctx.context.secret, keyFromDb.privateKey)
				: keyFromDb.privateKey,
		);

		const privateKey = (await importJWK(privateKeyJSON, alg)) as CryptoKey;
		return { id: keyFromDb.id, alg: alg as JwkAlgorithm, key: privateKey };
	}
	const publicKey = (await importJWK(
		getPublicJwk(keyFromDb.publicKey),
		alg,
	)) as CryptoKey;
	return { id: keyFromDb.id, alg: alg as JwkAlgorithm, key: publicKey };
}

/**
 * Returns a **private** or **public key** as a {`CryptoKey`}.
 *
 * @description
 * - If `jwk` is a {`CryptoKeyWithId`}, returns it directly.
 * - If `jwk` is a {`string`}, treats it as a **key ID** and fetches it from the database. If the key is not found, throws {`BetterAuthError`}.
 * - If `jwk` is **`undefined`**, returns the **latest key** from the database. Returns `undefined` if the database is **empty**.
 *
 * @param ctx - Endpoint context.
 * @param isPrivate - Whether to return the **private key** or the **public key**.
 * @param jwk - Optional. Either a **key ID** ({`string`}) or a {`CryptoKeyWithId`} object containing a {`CryptoKey`} and an optional `id` field to uniquely identify external keys.
 *
 * @throws {BetterAuthError} - If a **key ID** is provided but not found in the database.
 * @throws {TypeError | JOSENotSupported} - If `importJWK` fails due to **invalid key**.
 *
 * @returns An object containing:
 * - `keyId` — the **key ID** in the database or `undefined` if it's an external key without manually assigned **ID**
 * - `key` — the key: `CryptoKey` instance or `undefined` if the database is empty
 * - `alg` — the algorithm name or `undefined` if the database is empty
 */
export async function getJwk(
	ctx: GenericEndpointContext,
	isPrivate: boolean,
	jwk?: string | CryptoKeyIdAlg,
): Promise<CryptoKeyIdAlg | undefined> {
	return getJwkInternal(ctx, getJwtPluginOptions(ctx.context), isPrivate, jwk);
}

/**
 * Creates a new **JSON Web Key (JWK)** pair and saves it in the database.
 *
 * ⓘ **Internal use only**: not exported in `index.ts`.
 *
 * @param ctx - Endpoint context.
 * @param jwksOpts - Optional. Configuration for the key pair (algorithm, curve, etc.) and if to encrypt the private key.
 *
 * @throws {TypeError | JOSENotSupported} - If key generation fails.
 * @throws {Error} - If private key encryption or database insert fails.
 *
 * @returns The created JWK object stored in the database.
 */
export async function createJwkInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
): Promise<Jwk> {
	const jwkOpts = pluginOpts?.jwks?.keyPairConfig;

	const { publicKey, privateKey } = await generateExportedKeyPair(jwkOpts);
	const stringifiedPrivateKey = JSON.stringify(privateKey);

	let jwk: Omit<Jwk, "id"> = {
		publicKey: JSON.stringify({
			alg: jwkOpts?.alg ?? "EdDSA",
			...publicKey,
		}),
		privateKey: await ensureProperEncryption(
			ctx.context.secret,
			stringifiedPrivateKey,
			pluginOpts?.jwks?.disablePrivateKeyEncryption ?? false,
		),
		createdAt: new Date(),
	};

	const adapter = getJwksAdapter(ctx.context.adapter);
	const newKey = await adapter.createKey(jwk as Jwk);
	await updateCachedJwks(ctx, pluginOpts);
	return newKey;
}

/**
 * Creates a new **JSON Web Key (JWK)** pair and saves it in the database.
 *
 * ⓘ **Internal use only**: not exported in `index.ts`.
 *
 * @param ctx - Endpoint context.
 * @param options.jwkOpts - Optional. Configuration for the key pair (algorithm, curve, etc.). If not provided, plugin defaults are used.
 *
 * @throws {TypeError | JOSENotSupported} - If key generation fails.
 * @throws {Error} - If private key encryption or the database insert fails.
 *
 * @returns The newly created **JWK** stored in the database.
 */
export async function createJwk(
	ctx: GenericEndpointContext,
	options?: {
		jwkOpts?: JwkOptions;
	},
): Promise<Jwk> {
	const pluginOpts = getJwtPluginOptions(ctx.context);

	return createJwkInternal(ctx, {
		...pluginOpts,
		jwks: {
			...pluginOpts?.jwks,
			keyPairConfig: options?.jwkOpts ?? pluginOpts?.jwks?.keyPairConfig,
		},
	});
}

/**
 * Imports existing **JSON Web Key (JWK)** pair into the database.
 *
 * @param ctx - Endpoint context.
 * @param jwk - Imported key. **Must** have `id`.
 *
 * @throws {Error} - If private key encryption or the database insert fails.
 *
 * @returns The imported **JWK** stored in the database.
 */
export async function importJwkInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	jwk: JWK,
): Promise<Jwk> {
	const adapter = getJwksAdapter(ctx.context.adapter);

	const importedKey = await adapter.importKey({
		id: jwk.kid,
		publicKey: JSON.stringify(getPublicJwk(jwk)),
		privateKey: isPublicKey(jwk)
			? ""
			: await ensureProperEncryption(
					ctx.context.secret,
					JSON.stringify(jwk),
					pluginOpts?.jwks?.disablePrivateKeyEncryption ?? false,
				),
	} as Jwk);

	if (isPublicKey(jwk))
		ctx.context.logger.warn(
			"Importing JWK: Added a public key into the database",
			JSON.stringify(jwk),
		);

	await updateCachedJwks(ctx, pluginOpts);
	return importedKey;
}

/**
 * Imports existing **JSON Web Key (JWK)** pair into the database.
 *
 * @param ctx - Endpoint context.
 * @param privateKey - Private key. **Must** have `id`.
 *
 * @throws {Error} - If private key encryption or the database insert fails.
 *
 * @returns The imported **JWK** stored in the database.
 */
export async function importJwk(
	ctx: GenericEndpointContext,
	privateKey: CryptoKeyIdAlg,
): Promise<Jwk> {
	const exportedPrivateKey = await exportJWK(privateKey.key);
	exportedPrivateKey.kid = privateKey.id;

	if (privateKey.alg && privateKey.alg !== exportedPrivateKey.alg)
		throw new BetterAuthError(
			`Fail to import JWK: Algorithm mismatch within a CryptoKeyIdAlg (${privateKey.alg} !== ${exportedPrivateKey.alg})`,
			JSON.stringify(exportedPrivateKey),
		);

	exportedPrivateKey.alg = privateKey.alg;

	return importJwkInternal(
		ctx,
		getJwtPluginOptions(ctx.context),
		exportedPrivateKey,
	);
}
/**
 * Revokes **JWK pair**, it is still kept in the database with different `id` for transparency.
 *
 * @param ctx - Endpoint context.
 * @param keyId - **Key Id** of the pair to be revoked.
 *
 * @throws {Error} - If the database update fails.
 *
 * @returns The revoked **JWK** in the database.
 */
export async function revokeJwkInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	keyId: string,
): Promise<Jwk> {
	const adapter = getJwksAdapter(ctx.context.adapter);

	let revokedKey = await adapter.revokeKey(keyId);
	if (!revokedKey) {
		const jwks = await getAllKeysInternal(ctx, pluginOpts); // Do not use cache
		const remoteKey = jwks.remoteKeys.find((key) => key.kid === keyId);
		if (remoteKey === undefined)
			throw new BetterAuthError(
				`Failed to revoke a JWK: No such key found with ID "${keyId}"`,
				keyId,
			);

		revokedKey = await adapter.revokeRemoteKey(remoteKey);
	}
	await updateCachedJwks(ctx, pluginOpts);
	return revokedKey satisfies Jwk as Jwk;
}

/**
 * Revokes **JWK pair**, it is still kept in the database with different `id` for transparency.
 *
 * @param ctx - Endpoint context.
 * @param keyId - **Key Id** of the pair to be revoked.
 *
 * @throws {Error} - If the database update fails.
 *
 * @returns The revoked **JWK** in the database.
 */
export async function revokeJwk(
	ctx: GenericEndpointContext,
	keyId: string,
): Promise<Jwk> {
	return revokeJwkInternal(ctx, getJwtPluginOptions(ctx.context), keyId);
}

/**
 * @todo: JSDocs
 */
export async function getJwksInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
): Promise<Jwk[]> {
	const adapter = getJwksAdapter(ctx.context.adapter);

	const jwks = ((await adapter.getAllKeys()) ?? []).filter(
		(k) => !k.id.endsWith(revokedTag),
	);

	if (jwks.length === 0) {
		const key = await createJwkInternal(ctx, pluginOpts);
		jwks.push(key);
	}

	return jwks;
}

/**
 * @todo: JSDocs
 */
export async function getJwks(ctx: GenericEndpointContext): Promise<Jwk[]> {
	return getJwksInternal(ctx, getJwtPluginOptions(ctx.context));
}

export async function updateCachedJwks(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
): Promise<void> {
	invalidateCachedJwks();
	if (pluginOpts?.jwks?.disableJwksCaching) return;
	const { keys: keysRaw, remoteKeys: remoteKeysRaw } = await getAllKeysInternal(
		ctx,
		pluginOpts,
	);
	const { keys, remoteKeys } = await parseAllKeys(
		ctx,
		pluginOpts,
		keysRaw,
		remoteKeysRaw,
	);
	jwksCache.keys = keys;
	jwksCache.remoteKeys = remoteKeys;
	jwksCache.jwks = await keysToJwks(ctx, pluginOpts, keys.concat(remoteKeys));
	jwksCache.cachedAt = new Date();
}

export async function getCachedJwks(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
): Promise<JSONWebKeySet> {
	if (pluginOpts?.jwks?.disableJwksCaching)
		throw new BetterAuthError(
			"Failed to use JWKS cache: `getCachedJwks` was called but JWKS caching is disabled",
		);
	if (jwksCache.jwks.keys.length === 0) await updateCachedJwks(ctx, pluginOpts); // Will create a default JWK indirectly
	return structuredClone(jwksCache.jwks); // drop the cloning?
}

export async function getCachedDatabaseKeys(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
): Promise<JwkCache[]> {
	if (pluginOpts?.jwks?.disableJwksCaching)
		throw new BetterAuthError(
			"Failed to use JWKS cache: `getCachedDatabaseKeys` was called but JWKS caching is disabled",
		);
	if (jwksCache.keys.length === 0) await updateCachedJwks(ctx, pluginOpts); // Will create a default JWK indirectly
	return structuredClone(jwksCache.keys); // drop the cloning?
}

export async function getCachedRemoteKeys(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
): Promise<JwkCache[]> {
	if (pluginOpts?.jwks?.disableJwksCaching)
		throw new BetterAuthError(
			"Failed to use JWKS cache: `getCachedRemoteKeys` was called but JWKS caching is disabled",
		);
	if (jwksCache.keys.length === 0) await updateCachedJwks(ctx, pluginOpts); // Will create a default JWK indirectly
	return structuredClone(jwksCache.remoteKeys); // drop the cloning?
}

export function invalidateCachedJwks() {
	jwksCache.jwks = { keys: [] };
	jwksCache.keys = [];
	jwksCache.remoteKeys = [];
}

/**
 * @todo: JSDocs
 */
export async function getAllKeysInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
): Promise<{ keys: Jwk[]; remoteKeys: JWK[] }> {
	const jwks = await getJwksInternal(ctx, pluginOpts);
	let remoteKeys: JWK[] = [];

	if (pluginOpts?.jwks?.remoteJwks)
		for (const remoteKeyFetcher of pluginOpts.jwks.remoteJwks) {
			// Contains only keys with "id", "alg" defined and not marked as revoked
			remoteKeys = (await remoteKeyFetcher()).keys.filter(
				(remoteKey) =>
					remoteKey.kid !== undefined &&
					!jwks.some((key) => key.id === remoteKey.kid + revokedTag),
			);
		}

	return { keys: jwks, remoteKeys };
}
/**
 * @todo: JSDocs
 */
export async function getAllKeys(
	ctx: GenericEndpointContext,
): Promise<{ keys: Jwk[]; remoteKeys: JWK[] }> {
	return getAllKeysInternal(ctx, getJwtPluginOptions(ctx.context));
}

async function parseAllKeys(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	keys: Jwk[],
	remoteKeys: JWK[],
): Promise<{ keys: JwkCache[]; remoteKeys: JwkCache[] }> {
	const parsedKeys = await Promise.all(
		keys.map(async (key) => {
			return {
				id: key.id,
				publicKey: JSON.parse(key.publicKey),
				privateKey:
					key.privateKey.trim() === ""
						? ""
						: await ensureProperEncryption(
								ctx.context.secret,
								key.privateKey,
								false, // Cache is always encrypted
							),
			} satisfies JwkCache;
		}),
	);

	const parsedRemoteKeys = await Promise.all(
		remoteKeys.map(async (remoteKey) => {
			return {
				id: remoteKey.kid!,
				publicKey: getPublicJwk(remoteKey),
				privateKey: isPublicKey(remoteKey)
					? ""
					: await ensureProperEncryption(
							ctx.context.secret,
							JSON.stringify(remoteKey),
							false, // Cache is always encrypted
						),
			} satisfies JwkCache;
		}),
	);

	return { keys: parsedKeys, remoteKeys: parsedRemoteKeys };
}

async function keysToJwks(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	cachedKeys: JwkCache[],
): Promise<JSONWebKeySet> {
	const keyPairConfig = pluginOpts?.jwks?.keyPairConfig;
	const defaultCrv = keyPairConfig
		? "crv" in keyPairConfig
			? (keyPairConfig as { crv: string }).crv
			: undefined
		: undefined;

	return {
		keys: cachedKeys.map((cachedKey) => {
			const publicKey: JWK = cachedKey.publicKey;
			return {
				alg: publicKey.alg ?? keyPairConfig?.alg ?? "EdDSA",
				crv: publicKey.crv ?? defaultCrv,
				...publicKey,
				kid: cachedKey.id,
			} satisfies JWK as JWK;
		}),
	} satisfies JSONWebKeySet as JSONWebKeySet;
}

/**
 * @todo: JSDocs
 */
export async function getAllJwksInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
): Promise<JSONWebKeySet> {
	const { keys: keysRaw, remoteKeys: remoteKeysRaw } = await getAllKeysInternal(
		ctx,
		pluginOpts,
	);
	const { keys, remoteKeys } = await parseAllKeys(
		ctx,
		pluginOpts,
		keysRaw,
		remoteKeysRaw,
	);
	return keysToJwks(ctx, pluginOpts, keys.concat(remoteKeys));
}
/**
 * @todo: JSDocs
 */
export async function getAllJwks(
	ctx: GenericEndpointContext,
): Promise<JSONWebKeySet> {
	return getAllJwksInternal(ctx, getJwtPluginOptions(ctx.context));
}
