/**
 * `@better-auth/utils/password` uses the "node" export condition in package.json
 * to automatically pick the right implementation:
 *   - Node.js / Bun / Deno → `node:crypto scrypt` (libuv thread pool, non-blocking)
 *   - Unsupported runtimes → `@noble/hashes scrypt` (pure JS fallback)
 */

import {
	hashPassword as _hashPassword,
	verifyPassword as _verifyPassword,
} from "@better-auth/utils/password";

export const hashPassword = _hashPassword;

export const verifyPassword = async ({
	hash,
	password,
}: {
	hash: string;
	password: string;
}) => {
	return _verifyPassword(hash, password);
};
