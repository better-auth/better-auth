import type { GenericEndpointContext } from "../../types";
import type {
	CryptoKeyIdAlg,
	Jwk,
	JwkOptions,
	JwksOptions,
	JwtPluginOptions,
} from "./types";
import type { JWK } from "jose";
import { BetterAuthError } from "../../error";
import { getJwksAdapter } from "./adapter";
import {
	decryptPrivateKey,
	encryptPrivateKey,
	getJwtPluginOptions,
	getPublicJwk,
	isPrivateKeyEncrypted,
} from "./utils";
import { exportJWK, generateKeyPair, importJWK } from "jose";

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
	if (jwk !== undefined && typeof jwk !== "string") return jwk;

	const adapter = getJwksAdapter(ctx.context.adapter);

	let keyFromDb =
		jwk === undefined
			? await adapter.getLatestKey()
			: await adapter.getKeyById(jwk);
	if (!keyFromDb) {
		if (jwk !== undefined)
			// We are provided with keyId and we didn't find it in the database
			throw new BetterAuthError(
				`Failed to sign JWT: Could not find a JWK with provided ID: "${jwk}"`,
			);
		return undefined;
	}

	const publicKeyJSON = JSON.parse(keyFromDb.publicKey);
	const alg = publicKeyJSON.alg;
	if (!alg)
		throw new BetterAuthError(
			"Failed to create JWK: the public key does not contain its algorithm name",
			keyFromDb.publicKey,
		);

	if (isPrivate) {
		const privateKeyJSON = JSON.parse(
			isPrivateKeyEncrypted(keyFromDb.privateKey)
				? await decryptPrivateKey(ctx.context.secret, keyFromDb.privateKey)
				: keyFromDb.privateKey,
		);

		const privateKey = (await importJWK(privateKeyJSON, alg)) as CryptoKey;
		return { id: keyFromDb.id, alg: alg, key: privateKey };
	}

	const publicKey = (await importJWK(publicKeyJSON, alg)) as CryptoKey;
	return { id: keyFromDb.id, alg: alg, key: publicKey };
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
	jwksOpts?: JwksOptions,
	keyId?: string,
): Promise<Jwk> {
	const jwkOpts = jwksOpts?.keyPairConfig;

	const { publicKey, privateKey } = await generateExportedKeyPair(jwkOpts);
	const stringifiedPrivateKey = JSON.stringify(privateKey);

	let jwk: Omit<Jwk, "id"> = {
		publicKey: JSON.stringify({
			alg: jwkOpts?.alg ?? "EdDSA",
			...publicKey,
		}),
		privateKey: jwksOpts?.disablePrivateKeyEncryption
			? stringifiedPrivateKey
			: await encryptPrivateKey(ctx.context.secret, stringifiedPrivateKey),
		createdAt: new Date(),
	};

	const adapter = getJwksAdapter(ctx.context.adapter);

	return adapter.createKey(jwk as Jwk);
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
	const jwksOpts = getJwtPluginOptions(ctx.context)?.jwks || {
		keyPairConfig: options?.jwkOpts,
	};

	return createJwkInternal(ctx, jwksOpts);
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

	const adapter = getJwksAdapter(ctx.context.adapter);

	return adapter.importKey({
		id: privateKey.id!,
		publicKey: JSON.stringify(getPublicJwk(exportedPrivateKey)),
		privateKey: JSON.stringify(exportedPrivateKey),
	} as Jwk);
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
	const adapter = getJwksAdapter(ctx.context.adapter);

	const revokedKey = await adapter.revokeKey(keyId);
	if (!revokedKey)
		throw new BetterAuthError(
			`Failed to revoke a JWK: No such key found with ID "${keyId}"`,
			keyId,
		);

	return revokedKey as Jwk;
}
