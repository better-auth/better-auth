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
