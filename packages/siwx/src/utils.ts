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
