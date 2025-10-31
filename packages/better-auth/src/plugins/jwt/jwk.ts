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
 * Generates a new {@link JWK **JWK**} **pair** in a serializable format.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`.
 *
 * @param jwkOpts - Configuration for the **JWK pair**, including algorithm, curve, and other parameters. Defaults to `{ alg: "EdDSA", crv: "Ed25519" }`.
 *
 * @throws {`JOSEError`} *JOSE* `exportJWK`/`generateKeyPair` failed.
 * @throws {`JOSENotSupported`} - If the **JWK algorithm** is not supported. Subclass of {`JOSEError`}.
 *
 * @returns An object containing:
 * - `publicKey`: The exported **public JWK**.
 * - `privateKey`: The exported **private JWK**.
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
 * Returns the **parsed JWK** ({`CryptoKeyWithId`}) if available.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`. It may be called before the **"jwt" plugin** is initialized - in such cases, `getJwtPluginOptions` cannot access the **"jwt" plugin configuration**, so `pluginOpts` must be provided directly.
 *
 * @description
 * - If `jwk` is a {`CryptoKeyWithId`}, it is returned as-is. This is an **external JWK**.
 * - If `jwk` is a {`string`}, it is treated as a **key ID** and looked up in the **cache**, **database**, or {@link JwksOptions **remote JWK**s}.
 * - If `jwk` is `undefined`, the **latest JWK** is retrieved from the **database**. Returns `undefined` if the **database** has no **non-revoked JWK**s.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param jwk - The **ID** ({`string`}) of the {@link JWK **JWK**} or the **parsed JWK** ({`CryptoKeyExtended`}).
 * @param isPrivate - Whether to return the **private JWK** or the **public JWK**.
 *
 * @throws {`BetterAuthError`} - If a **key ID** is provided but not found in the **database**.
 * @throws {`JOSEError`} - If *JOSE* `importJWK`/`exportJWK`/`generateKeyPair` failed.
 * @todo update throws
 *
 * @returns `undefined` if the **database** has no **non-revoked JWK**s, or an object containing:
 * - `keyId` - The **key ID** or `undefined` if it's an **external JWK** without manually assigned **ID**.
 * - `key` - {`CryptoKey`} or `undefined` if the {@link JWK **JWK**} was not found.
 * - `alg` - The **JWK algorithm** name .
 */
export async function getJwkInternal(
	ctx: GenericEndpointContext,
	pluginOpts: JwtPluginOptions | undefined,
	jwk?: string | CryptoKeyIdAlg,
	isPrivate?: boolean,
): Promise<CryptoKeyIdAlg | undefined> {
	if (jwk !== undefined && typeof jwk !== "string") return jwk;

	let key = await getKeySet(ctx, pluginOpts, jwk);

	if (!key) {
		if (jwk !== undefined)
			// We are provided with keyId and we didn't find it in the database
			throw new BetterAuthError(
				`Failed to access the JWK: Could not find a JWK with provided ID: "${jwk}"`,
				jwk,
			);
		return undefined;
	}

	const alg = key.publicKey.alg;
	if (!alg)
		throw new BetterAuthError(
			`Failed to access the JWK: the public key with ID "${key.id}" does not contain its algorithm name`,
			key.id,
		);
	/*
    if (!isJwkAlgValid(alg))
		throw new BetterAuthError(
			`Failed to access the JWK: the public key with ID "${keyFromDb.id}" has invalid algorithm name`,
			keyFromDb.id,
		);
    */

	if (isPrivate) {
		if (key.privateKey.trim() === "")
			throw new BetterAuthError(
				`Failed to access the JWK: Tried to access a private key from a public-only entry with ID "${key.id}"`,
				key.id,
			);
		const privateKeyJSON = JSON.parse(
			isPrivateKeyEncrypted(key.privateKey)
				? await decryptPrivateKey(ctx.context.secret, key.privateKey)
				: key.privateKey,
		);

		const privateKey = (await importJWK(privateKeyJSON, alg)) as CryptoKey;
		return { id: key.id, alg: alg as JwkAlgorithm, key: privateKey };
	}
	const publicKey = (await importJWK(
		getPublicJwk(key.publicKey),
		alg,
	)) as CryptoKey;
	return { id: key.id, alg: alg as JwkAlgorithm, key: publicKey };
}

/**
 * Returns the **parsed JWK** ({`CryptoKeyWithId`}) if available.
 *
 * @description
 * - If `jwk` is a {`CryptoKeyWithId`}, it is returned as-is. This is an **external JWK**.
 * - If `jwk` is a {`string`}, it is treated as a **key ID** and looked up in the **cache**, **database**, or {@link JwksOptions **remote JWK**s}.
 * - If `jwk` is `undefined`, the **latest JWK** is retrieved from the **database**. Returns `undefined` if the **database** has no **non-revoked JWK**s.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param jwk - The **ID** ({`string`}) of the {@link JWK **JWK**} or the **parsed JWK** ({`CryptoKeyExtended`}).
 * @param isPrivate - Whether to return the **private JWK** or the **public  JWK**.
 *
 * @throws {`BetterAuthError`} - If a **key ID** is provided but not found in the **database**.
 * @throws {`JOSEError`} - If *JOSE* `importJWK`/`exportJWK`/`generateKeyPair` failed.
 * @todo update throws
 *
 * @returns `undefined` if the **database** has no **non-revoked JWK**s, or an object containing:
 * - `keyId` - The **key ID** or `undefined` if it's an **external JWK** without manually assigned **ID**.
 * - `key` - {`CryptoKey`} or `undefined` if the {@link JWK **JWK**} was not found.
 * - `alg` - The **JWK algorithm** name .
 */
export async function getJwk(
	ctx: GenericEndpointContext,
	jwk?: string | CryptoKeyIdAlg,
	isPrivate?: boolean,
): Promise<CryptoKeyIdAlg | undefined> {
	return getJwkInternal(ctx, getJwtPluginOptions(ctx.context), jwk, isPrivate);
}

/**
 * Creates a new **JSON Web Key (JWK) pair** - consisting of a **public key** and a **private key** that share the same **ID** - and saves it to the **database**.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`. It may be called before the **"jwt" plugin** is initialized - in such cases, `getJwtPluginOptions` cannot access the **"jwt" plugin configuration**, so `pluginOpts` must be provided directly.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 *
 * @throws {`BetterAuth`} - In case of very unprobable streak of generating 10 {@link JWK **JWK**}s in a row with already **revoked ID**, or ones that have their **ID taken** by the **remote JWK**s.
 * @throws {`JOSEError`} - If *JOSE* `exportJWK`/`generateKeyPair` failed.
 * @throws {`JOSENotSupported`} - If the **JWK algorithm** is not supported. Subclass of {`JOSEError`}.
 * @throws {`Error`} - If **private JWK encryption** or **database insertion** failed. The exact type depends on the **database**.
 *
 * @returns An object representing the **database record** of the new **JSON Web Key (JWK) pair**, containing:
 * - `id`: The unique identifier of the **JWK pair**.
 * - `publicKey`: The serialized **public JWK**.
 * - `privateKey`: The serialized **private JWK**.
 * - `createdAt`: A **creation timestamp** of the **JWK pair**.
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
 * Creates a new **JSON Web Key (JWK) pair** - consisting of a **public key** and a **private key** that share the same **ID** - and saves it to the **database**.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param options.jwkOpts - Configuration for the **JWK pair**, including algorithm, curve, and other parameters. Defaults to `{ alg: "EdDSA", crv: "Ed25519" }`.
 *
 * @throws {`BetterAuth`} - In case of very unprobable streak of generating 10 {@link JWK **JWK**s} in a row with already **revoked ID**, or ones that have their **ID taken** by the **remote JWK**s.
 * @throws {`JOSEError`} - If *JOSE* `exportJWK`/`generateKeyPair` failed.
 * @throws {`JOSENotSupported`} - If the **JWK algorithm** is not supported. Subclass of {`JOSEError`}.
 * @throws {`Error`} - If **private JWK encryption** or **database insertion** failed. The exact type depends on the **database**.
 *
 * @returns An object representing the **database record** of the new **JSON Web Key (JWK) pair**, containing:
 * - `id`: The unique identifier of the **JWK pair**.
 * - `publicKey`: The serialized **public JWK**.
 * - `privateKey`: The serialized **private JWK**.
 * - `createdAt`: A **creation timestamp** of the **JWK pair**.
 */
export async function createJwk(
	ctx: GenericEndpointContext,
	options?: {
		//keyRing?: string;
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
 * Imports an existing **JSON Web Key (JWK)** into the **database**.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`. It may be called before the **"jwt" plugin** is initialized - in such cases, `getJwtPluginOptions` cannot access the **"jwt" plugin configuration**, so `pluginOpts` must be provided directly.
 *
 * @description Parses the {@link JWK **JWK**} to match the **database schema**, and:
 * - If the {@link JWK **JWK**} is **private**, creates a **public JWK** from it and inserts the **JWK pair** into the **database**.
 * - If the {@link JWK **JWK**} is **public**, the `privateKey` field will be `""` (an empty {`string`}).
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param jwk - The {@link JWK **JWK**} to import.
 *
 * @throws {`Error`} - If **private JWK encryption** or **database insertion** failed. The exact type depends on the **database**.
 * @throws {`BetterAuth`} Tried to import a {@link JWk **JWK**} that has same **ID** as one of **local** or **remote** {@link JWK **JWK**s}.
 *
 * @returns An object representing the **imported JWK** in the **database**.
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
 * Imports an existing **JSON Web Key (JWK)** into the **database**.
 *
 * @description Parses the {@link JWK **JWK**} to match the **database schema**, and:
 * - If the {@link JWK **JWK**} is **private**, creates a **public JWK** from it and inserts the **JWK pair** into the **database**.
 * - If the {@link JWK **JWK**} is **public**, sets `privateKey` to `""` (an empty {`string`}).
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param jwk - The {@link JWK **JWK**} to import.
 *
 * @throws {`Error`} - If the **private JWK encryption** or **database insertion** failed. Exact type depends on the **database**.
 *
 * @returns An object representing the **imported JWK** in the **database**.
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
 * Revokes a **JWK pair** while keeping it in the **database** under a new **ID** (`id` + `revokedTag`) for transparency.
 *
 * ⓘ **Internal use only**: This function is not exported from `better-auth/plugins/jwt`. It may be called before the **"jwt" plugin** is initialized - in such cases, `getJwtPluginOptions` cannot access the **"jwt" plugin configuration**, so `pluginOpts` must be provided directly.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param {JwtPluginOptions | undefined} pluginOpts - {@link JwtPluginOptions The "jwt" plugin configuration}.
 * @param keyId - The **key ID** of the **JWK pair** to revoke.
 *
 * @throws {`BetterAuthError`} - If no matching **JWK pair** is found.
 * @throws {`Error`} - If the **database update** failed.
 *
 * @returns An object representing the **revoked JWK** record in the **database**.
 *
 * @todo Check if it is possible to add an optional "revoked" database "jwks" table field  without forcing a **database migration**, and allow revoking only when the field exists.
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
 * Revokes a **JWK pair** while keeping it in the **database** under a new **ID** (`id` + `revokedTag`) for transparency.
 *
 * @param {GenericEndpointContext} ctx - The endpoint context.
 * @param keyId - The **key ID** of the **JWK pair** to revoke.
 *
 * @throws {`BetterAuthError`} - If no matching **JWK pair** is found.
 * @throws {`Error`} - If **private JWK encryption** or **database insertion** failed. The exact type depends on the **database**.
 *
 * @returns An object representing the **revoked JWK** record in the **database**.
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

	if (!pluginOpts?.jwks?.remoteJwks?.length)
		return { keys: jwks, remoteKeys: [] };

	const revokedIds = new Set(jwks.map((key) => key.id + revokedTag));

	const remoteKeysArrays = await Promise.all(
		pluginOpts.jwks.remoteJwks.map((fetcher) => fetcher()),
	);

	// Contains only keys with "id", "alg" defined and not marked as revoked
	const remoteKeys: JWK[] = remoteKeysArrays.flatMap(({ keys }) =>
		keys.filter(
			(remoteKey) =>
				remoteKey.kid !== undefined && !revokedIds.has(remoteKey.kid),
		),
	);

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
