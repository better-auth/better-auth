import { subtle, getRandomValues } from "@better-auth/utils";
import { base64 } from "@better-auth/utils/base64";
import { joseSecs } from "../../utils/time";
import type { JwtOptions, Jwk } from "./types";
import { generateKeyPair, exportJWK } from "jose";
import type { GenericEndpointContext } from "../../types";
import { symmetricEncrypt } from "../../crypto";
import { getJwksAdapter } from "./adapter";

/**
 * Converts an expirationTime to ISO seconds expiration time (the format of JWT exp)
 *
 * See https://github.com/panva/jose/blob/main/src/lib/jwt_claims_set.ts#L245
 *
 * @param expirationTime - see options.jwt.expirationTime
 * @param iat - the iat time to consolidate on
 * @returns
 */
export function toExpJWT(
	expirationTime: number | Date | string,
	iat: number,
): number {
	if (typeof expirationTime === "number") {
		return expirationTime;
	} else if (expirationTime instanceof Date) {
		return Math.floor(expirationTime.getTime() / 1000);
	} else {
		return iat + joseSecs(expirationTime);
	}
}

async function deriveKey(secretKey: string): Promise<CryptoKey> {
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		enc.encode(secretKey),
		{ name: "PBKDF2" },
		false,
		["deriveKey"],
	);

	return subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: enc.encode("encryption_salt"),
			iterations: 100000,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

export async function encryptPrivateKey(
	privateKey: string,
	secretKey: string,
): Promise<{ encryptedPrivateKey: string; iv: string; authTag: string }> {
	const key = await deriveKey(secretKey); // Derive a 32-byte key from the provided secret
	const iv = getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM

	const enc = new TextEncoder();
	const ciphertext = await subtle.encrypt(
		{
			name: "AES-GCM",
			iv: iv,
		},
		key,
		enc.encode(privateKey),
	);

	const encryptedPrivateKey = base64.encode(ciphertext);
	const ivBase64 = base64.encode(iv);

	return {
		encryptedPrivateKey,
		iv: ivBase64,
		authTag: encryptedPrivateKey.slice(-16),
	};
}

export async function decryptPrivateKey(
	encryptedPrivate: {
		encryptedPrivateKey: string;
		iv: string;
		authTag: string;
	},
	secretKey: string,
): Promise<string> {
	const key = await deriveKey(secretKey);
	const { encryptedPrivateKey, iv } = encryptedPrivate;

	const ivBuffer = base64.decode(iv);
	const ciphertext = base64.decode(encryptedPrivateKey);

	const decrypted = await subtle.decrypt(
		{
			name: "AES-GCM",
			iv: ivBuffer as BufferSource,
		},
		key,
		ciphertext as BufferSource,
	);

	const dec = new TextDecoder();
	return dec.decode(decrypted);
}

export async function generateExportedKeyPair(options?: JwtOptions) {
	const { alg, ...cfg } = options?.jwks?.keyPairConfig ?? {
		alg: "EdDSA",
		crv: "Ed25519",
	};
	const { publicKey, privateKey } = await generateKeyPair(alg, {
		...cfg,
		extractable: true,
	});

	const publicWebKey = await exportJWK(publicKey);
	const privateWebKey = await exportJWK(privateKey);

	return { publicWebKey, privateWebKey, alg, cfg };
}

/**
 * Creates a Jwk on the database
 *
 * @param ctx
 * @param options
 * @returns
 */
export async function createJwk(
	ctx: GenericEndpointContext,
	options?: JwtOptions,
) {
	const { publicWebKey, privateWebKey, alg, cfg } =
		await generateExportedKeyPair(options);

	const stringifiedPrivateWebKey = JSON.stringify(privateWebKey);
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;
	let jwk: Omit<Jwk, "id"> = {
		alg,
		...(cfg && "crv" in cfg
			? {
					crv: (cfg as { crv: (typeof jwk)["crv"] }).crv,
				}
			: {}),
		publicKey: JSON.stringify(publicWebKey),
		privateKey: privateKeyEncryptionEnabled
			? JSON.stringify(
					await symmetricEncrypt({
						key: ctx.context.secret,
						data: stringifiedPrivateWebKey,
					}),
				)
			: stringifiedPrivateWebKey,
		createdAt: new Date(),
	};

	const adapter = getJwksAdapter(ctx.context.adapter);
	const key = await adapter.createJwk(jwk as Jwk);

	return key;
}
