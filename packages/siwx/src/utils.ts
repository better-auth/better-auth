import { keccak_256 } from "@noble/hashes/sha3.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * TS implementation of ERC-55 ("Mixed-case checksum address encoding") using @noble/hashes
 * @param address - The address to convert to a checksum address
 * @returns The checksummed address
 */
export function toChecksumAddress(address: string) {
	address = address.toLowerCase().replace("0x", "");
	// Hash the address (treat it as UTF-8) and return as a hex string
	const hash = [...keccak_256(utf8ToBytes(address))]
		.map((v) => v.toString(16).padStart(2, "0"))
		.join("");
	let ret = "0x";

	for (let i = 0; i < 40; i++) {
		if (parseInt(hash[i]!, 16) >= 8) {
			ret += address[i]!.toUpperCase();
		} else {
			ret += address[i]!;
		}
	}

	return ret;
}

/**
 * Whether `message` binds `nonce` as a standalone token rather than as an
 * incidental substring of a larger token. A bare `includes` check would accept
 * a signed message whose authoritative nonce differs but that happens to embed
 * the issued nonce inside another field, so the nonce must be delimited on both
 * sides by a non-token character (or the start/end of the message). Any Unicode
 * letter, number, or mark counts as a token character, and boundaries are read
 * as whole code points so surrogate pairs are not split.
 * @param message - The signed message to inspect
 * @param nonce - The server-issued nonce that must be bound
 * @returns Whether the nonce appears as a delimited token in the message
 */
export function messageBindsNonce(message: string, nonce: string): boolean {
	if (nonce.length === 0) return false;
	const isTokenChar = (char: string | undefined) =>
		char !== undefined && /[\p{L}\p{N}\p{M}]/u.test(char);
	let from = message.indexOf(nonce);
	while (from !== -1) {
		const before = message.slice(0, from).match(/.$/su)?.[0];
		const after = message.slice(from + nonce.length).match(/^./su)?.[0];
		if (!isTokenChar(before) && !isTokenChar(after)) return true;
		from = message.indexOf(nonce, from + 1);
	}
	return false;
}

export function getOrigin(url: string) {
	try {
		const parsedUrl = new URL(url);
		// For custom URL schemes (like exp://), the origin property returns the string "null"
		// instead of null. We need to handle this case and return null so the fallback logic works.
		return parsedUrl.origin === "null" ? null : parsedUrl.origin;
	} catch {
		return null;
	}
}
