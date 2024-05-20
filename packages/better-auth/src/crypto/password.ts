import * as argon2 from "argon2";

export const hashPassword = async (password: string) => {
	return argon2.hash(password, {
		type: argon2.argon2id,
	});
};

export const validatePassword = async (password: string, hash: string) => {
	return argon2.verify(hash, password);
};
