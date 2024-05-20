import * as argon2 from "argon2";
import { generateRandomString } from "./random";

export const hashPassword = async (password: string, secret: string) => {
	const salt = generateRandomString(12);
	const hash = await argon2.hash(password, {
		type: argon2.argon2id,
		salt,
		secret,
	});
	return `${hash}$${salt}`;
};

export const validatePassword = async (password: string, hash: string) => {
	const [hashPart, salt] = hash.split("$");
	if (!hashPart || !salt) return false;
	return argon2.verify(hashPart, password);
};
