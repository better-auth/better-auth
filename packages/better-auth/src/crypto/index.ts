import { getWebcryptoSubtle } from "@better-auth/utils";
import { createHash } from "@better-auth/utils/hash";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import {
	bytesToHex,
	hexToBytes,
	managedNonce,
	utf8ToBytes,
} from "@noble/ciphers/utils.js";

const algorithm = { name: "HMAC", hash: "SHA-256" };

export type SymmetricEncryptOptions = {
	key: string;
	data: string;
};

export const symmetricEncrypt = async ({
	key,
	data,
}: SymmetricEncryptOptions) => {
	const keyAsBytes = await createHash("SHA-256").digest(key);
	const dataAsBytes = utf8ToBytes(data);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	return bytesToHex(chacha.encrypt(dataAsBytes));
};

export type SymmetricDecryptOptions = {
	key: string;
	data: string;
};

export const symmetricDecrypt = async ({
	key,
	data,
}: SymmetricDecryptOptions) => {
	const keyAsBytes = await createHash("SHA-256").digest(key);
	const dataAsBytes = hexToBytes(data);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	return new TextDecoder().decode(chacha.decrypt(dataAsBytes));
};

export const getCryptoKey = async (secret: string | BufferSource) => {
	const secretBuf =
		typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
	return await getWebcryptoSubtle().importKey(
		"raw",
		secretBuf,
		algorithm,
		false,
		["sign", "verify"],
	);
};

export const makeSignature = async (
	value: string,
	secret: string | BufferSource,
): Promise<string> => {
	const key = await getCryptoKey(secret);
	const signature = await getWebcryptoSubtle().sign(
		algorithm.name,
		key,
		new TextEncoder().encode(value),
	);
	// the returned base64 encoded signature will always be 44 characters long and end with one or two equal signs
	return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

export * from "./buffer";
export * from "./jwt";
export * from "./password";
export * from "./random";
