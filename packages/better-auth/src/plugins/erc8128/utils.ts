import { keccak_256 } from "@noble/hashes/sha3.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { base64 } from "@better-auth/utils/base64";
import { parseKeyId } from "@slicekit/erc8128";
import { toChecksumAddress } from "../../utils/hashing";

export function parseErc8128KeyId(keyId: string): {
	address: string;
	chainId: number;
} | null {
	const parsed = parseKeyId(keyId);
	if (!parsed) {
		return null;
	}
	return {
		address: toChecksumAddress(parsed.address),
		chainId: parsed.chainId,
	};
}

export function normalizeErc8128KeyId(keyId: string): string | null {
	const parsed = parseKeyId(keyId);
	if (!parsed) {
		return null;
	}
	return `erc8128:${parsed.chainId}:${parsed.address.toLowerCase()}`;
}

function hashErc8128Value(value: string): string {
	return `0x${Array.from(keccak_256(utf8ToBytes(value)))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("")}`;
}

export function getErc8128SignatureHash(signature: string): string {
	return hashErc8128Value(signature.toLowerCase());
}

export function getErc8128CacheKey(args: {
	address: string;
	signature: string;
	messageRaw: string;
}): string {
	return hashErc8128Value(
		`${args.address.toLowerCase()}:${args.signature.toLowerCase()}:${args.messageRaw.toLowerCase()}`,
	);
}

export function getErc8128InvalidationMatchKey(keyId: string): string | null {
	return normalizeErc8128KeyId(keyId);
}

export function getErc8128SignatureInvalidationMatchKey(
	keyId: string,
	signatureHash: string,
): string | null {
	const keyMatch = getErc8128InvalidationMatchKey(keyId);
	if (!keyMatch) {
		return null;
	}
	return `${keyMatch}:${signatureHash}`;
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
	return `0x${Array.from(bytes, (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("")}`;
}

export function decodeBase64ToBytes(value: string): Uint8Array | null {
	try {
		return base64.decode(value);
	} catch {
		return null;
	}
}
