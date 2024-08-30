import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils";
import { managedNonce } from "@noble/ciphers/webcrypto";
import { sha256 } from "@noble/hashes/sha256";

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

export const symmetricEncrypt = ({ key, data }: SymmetricEncryptOptions) => {
	const keyAsBytes = sha256(key);
	const dataAsBytes = utf8ToBytes(data);
	const chacha = managedNonce(xchacha20poly1305)(keyAsBytes);
	return bytesToHex(chacha.encrypt(dataAsBytes));
};

export type SymmetricDecryptOptions = {
	key: string;
	data: string;
};

export const symmetricDecrypt = ({ key, data }: SymmetricDecryptOptions) => {
	const keyAsBytes = sha256(key);
	const dataAsBytes = hexToBytes(data);
	const chacha = managedNonce(xchacha20poly1305)(keyAsBytes);
	return chacha.decrypt(dataAsBytes);
};
