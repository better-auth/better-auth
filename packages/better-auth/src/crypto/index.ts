import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils";
import { managedNonce } from "@noble/ciphers/webcrypto";
import { sha256 } from "oslo/crypto";
import crypto from "uncrypto";

export async function hs256(secretKey: string, message: string) {
	const enc = new TextEncoder();
	const algorithm = { name: "HMAC", hash: "SHA-256" };
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secretKey),
		algorithm,
		false,
		["sign", "verify"],
	);
	const signature = await crypto.subtle.sign(
		algorithm.name,
		key,
		enc.encode(message),
	);
	return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export type SymmetricEncryptOptions = {
	key: string;
	data: string;
};

export const symmetricEncrypt = async ({
	key,
	data,
}: SymmetricEncryptOptions) => {
	const keyAsBytes = await sha256(new TextEncoder().encode(key));
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
	const keyAsBytes = await sha256(new TextEncoder().encode(key));
	const dataAsBytes = hexToBytes(data);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	return new TextDecoder().decode(chacha.decrypt(dataAsBytes));
};

export * from "./buffer";
export * from "./password";
export * from "./random";
export * from "./buffer";
