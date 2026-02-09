/**
 * Proof of Work Challenge System - Client Side
 *
 * Client-side PoW solver and encoding utilities.
 * Server-side challenge generation and verification moved to Infra API.
 */

// ============================================================================
// Types
// ============================================================================

export interface PoWChallenge {
	/** Random nonce for this challenge */
	nonce: string;
	/** Number of leading zero bits required */
	difficulty: number;
	/** Timestamp when challenge was created */
	timestamp: number;
	/** Challenge expiry time in seconds */
	ttl: number;
}

export interface PoWSolution {
	/** The nonce from the challenge */
	nonce: string;
	/** The counter value that produces valid hash */
	counter: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default difficulty in bits (18 = ~500ms solve time) */
export const DEFAULT_DIFFICULTY = 18;

/** Challenge TTL in seconds */
export const CHALLENGE_TTL = 60;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * SHA-256 hash function that works in both Node.js and browser
 */
async function sha256(message: string): Promise<string> {
	const msgBuffer = new TextEncoder().encode(message);
	const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check if a hash has the required number of leading zero bits
 */
function hasLeadingZeroBits(hash: string, bits: number): boolean {
	// Each hex char represents 4 bits
	const fullHexChars = Math.floor(bits / 4);
	const remainingBits = bits % 4;

	// Check full zero hex characters
	for (let i = 0; i < fullHexChars; i++) {
		if (hash[i] !== "0") return false;
	}

	// Check remaining bits in the next hex character
	if (remainingBits > 0 && fullHexChars < hash.length) {
		const charValue = parseInt(hash[fullHexChars]!, 16);
		const maxValue = (1 << (4 - remainingBits)) - 1;
		if (charValue > maxValue) return false;
	}

	return true;
}

// ============================================================================
// Client-side PoW Solver
// ============================================================================

/**
 * Solve a PoW challenge (browser-compatible)
 * This function is designed to run in a browser environment
 */
export async function solvePoWChallenge(
	challenge: PoWChallenge,
): Promise<PoWSolution> {
	const { nonce, difficulty } = challenge;
	let counter = 0;

	while (true) {
		const input = `${nonce}:${counter}`;
		const hash = await sha256(input);

		if (hasLeadingZeroBits(hash, difficulty)) {
			return { nonce, counter };
		}

		counter++;

		// Yield to event loop every 1000 iterations to prevent blocking UI
		if (counter % 1000 === 0) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}
}

/**
 * Decode a base64-encoded challenge string (browser-compatible)
 */
export function decodePoWChallenge(encoded: string): PoWChallenge | null {
	try {
		// Use atob for browser, Buffer for Node
		const decoded =
			typeof atob !== "undefined"
				? atob(encoded)
				: Buffer.from(encoded, "base64").toString("utf-8");
		return JSON.parse(decoded);
	} catch {
		return null;
	}
}

/**
 * Encode a solution string (browser-compatible)
 */
export function encodePoWSolution(solution: PoWSolution): string {
	const json = JSON.stringify(solution);
	// Use btoa for browser, Buffer for Node
	return typeof btoa !== "undefined"
		? btoa(json)
		: Buffer.from(json).toString("base64");
}

/**
 * Verify a PoW solution locally (for testing purposes)
 */
export async function verifyPoWSolution(
	nonce: string,
	counter: number,
	difficulty: number,
): Promise<boolean> {
	const input = `${nonce}:${counter}`;
	const hash = await sha256(input);
	return hasLeadingZeroBits(hash, difficulty);
}
