import { verify, hash } from "@node-rs/argon2";

const v0x13 = 1;
const config = {
	memorySize: 19456,
	iterations: 2,
	tagLength: 32,
	parallelism: 1,
};

export function getPasswordHasher(secret: string) {
	const hashPassword = async (password: string) =>
		await hash(password.normalize("NFKC"), {
			memoryCost: config.memorySize,
			timeCost: config.iterations,
			outputLen: config.tagLength,
			parallelism: config.parallelism,
			version: v0x13,
			secret: Buffer.from(secret),
		});

	const verifyPassword = async (password: string, hash: string) =>
		await verify(hash, password.normalize("NFKC"), {
			memoryCost: config.memorySize,
			timeCost: config.iterations,
			outputLen: config.tagLength,
			parallelism: config.parallelism,
			version: v0x13,
			secret: Buffer.from(secret),
		});
	return { hashPassword, verifyPassword };
}
