import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { BetterAuthOptions } from "../types";

/**
 * Hash a session token for storage: SHA-256, encoded as base64url without
 * padding.
 */
export async function hashSessionToken(token: string): Promise<string> {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(token),
	);
	return base64Url.encode(new Uint8Array(hash), { padding: false });
}

/**
 * Whether `session.storeTokenHash` is enabled.
 */
export function isSessionTokenHashed(
	options: Pick<BetterAuthOptions, "session">,
): boolean {
	return options.session?.storeTokenHash === true;
}

/**
 * The value stored for a raw session token: its hash when
 * `session.storeTokenHash` is enabled, otherwise the token itself.
 */
export async function getStoredSessionToken(
	options: Pick<BetterAuthOptions, "session">,
	token: string,
): Promise<string> {
	return isSessionTokenHashed(options) ? hashSessionToken(token) : token;
}
