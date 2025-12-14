import { BetterAuthError } from "@better-auth/core/error";
import { hex } from "@better-auth/utils/hex";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { constantTimeEqual } from "./buffer";

const config = {
	N: 16384,
	r: 16,
	p: 1,
	dkLen: 64,
};

async function generateKey(password: string, salt: string) {
	return await scryptAsync(password.normalize("NFKC"), salt, {
		N: config.N,
		p: config.p,
		r: config.r,
		dkLen: config.dkLen,
		maxmem: 128 * config.N * config.r * 2,
	});
}

export const hashPassword = async (password: string) => {
	const salt = hex.encode(crypto.getRandomValues(new Uint8Array(16)));
	const key = await generateKey(password, salt);
	return `${salt}:${hex.encode(key)}`;
};

export const verifyPassword = async ({
	hash,
	password,
}: {
	hash: string;
	password: string;
}) => {
	const [salt, key] = hash.split(":");
	if (!salt || !key) {
		throw new BetterAuthError("Invalid password hash");
	}
	const targetKey = await generateKey(password, salt!);
	return constantTimeEqual(targetKey, hexToBytes(key));
};
