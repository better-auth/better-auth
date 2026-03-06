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

const nativeScryptFn: Promise<typeof import("node:crypto").scrypt | null> =
	(async () => {
		try {
			const { scrypt } = await import("node:crypto");
			if (typeof scrypt === "function") return scrypt;
			return null;
		} catch {
			return null;
		}
	})();

function nativeGenerateKey(
	scryptFn: typeof import("node:crypto").scrypt,
	password: string,
	salt: string,
): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		scryptFn(
			password,
			salt,
			config.dkLen,
			{
				N: config.N,
				r: config.r,
				p: config.p,
				maxmem: 128 * config.N * config.r * 2,
			},
			(err, derivedKey) => {
				if (err) reject(err);
				else resolve(new Uint8Array(derivedKey));
			},
		);
	});
}

async function generateKey(
	password: string,
	salt: string,
): Promise<Uint8Array> {
	const normalizedPassword = password.normalize("NFKC");
	const scryptFn = await nativeScryptFn;
	if (scryptFn) {
		return nativeGenerateKey(scryptFn, normalizedPassword, salt);
	}
	return scryptAsync(normalizedPassword, salt, {
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
