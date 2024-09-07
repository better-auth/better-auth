import { verify, hash } from "argon2";

export function getPasswordHasher(secret: string) {
	const hashPassword = async (password: string) =>
		await hash(password.normalize("NFKC"), {
			secret: Buffer.from(secret),
		});
	const verifyPassword = async (password: string, hash: string) =>
		await verify(hash, password.normalize("NFKC"), {
			secret: Buffer.from(secret),
		});
	return { hashPassword, verifyPassword };
}
