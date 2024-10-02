import { scrypt } from "node:crypto";
import { decodeHex, encodeHex } from "oslo/encoding";
import { constantTimeEqual } from "./buffer";

const config = {
	N: 16384,
	r: 16,
	p: 1,
	dkLen: 64,
};

async function generateKey(
	password: string,
	salt: string,
): Promise<ArrayBuffer> {
	return await new Promise<ArrayBuffer>((resolve, reject) => {
		scrypt(
			password.normalize("NFKC"),
			salt!,
			config.dkLen,
			{
				N: config.N,
				p: config.p,
				r: config.r,
				// errors when 128 * N * r > `maxmem` (approximately)
				maxmem: 128 * config.N * config.r * 2,
			},
			(err, buff) => {
				if (err) return reject(err);
				// @ts-ignore
				return resolve(buff);
			},
		);
	});
}

export const hashPassword = async (password: string) => {
	const salt = encodeHex(crypto.getRandomValues(new Uint8Array(16)));
	const key = await generateKey(password, salt);
	return `${salt}:${encodeHex(key)}`;
};

export const verifyPassword = async (hash: string, password: string) => {
	const [salt, key] = hash.split(":");
	const targetKey = await generateKey(password, salt!);
	return constantTimeEqual(targetKey, decodeHex(key!));
};
