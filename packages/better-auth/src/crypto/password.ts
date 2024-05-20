import * as argon2 from "argon2";
import { generateRandomString } from "./random";

export const hashPassword = async (password: string, secret: string) => {
	const salt = generateRandomString(12);
	const hash = await argon2.hash(password, {
		type: argon2.argon2id,
		salt: Buffer.from(salt),
		secret: Buffer.from(secret),
	});
	return hash;
};

export const validatePassword = async (
	password: string,
	hash: string,
	secret: string,
) => {
	const res = await argon2.verify(hash, password, {
		secret: Buffer.from(secret),
	});
	return res;
};
