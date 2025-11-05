import { createHash } from "@better-auth/utils/hash";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import {
	bytesToHex,
	hexToBytes,
	managedNonce,
	utf8ToBytes,
} from "@noble/ciphers/utils.js";

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

export * from "./buffer";
export * from "./jwt";
export * from "./password";
export * from "./random";
