import { hex } from "@better-auth/utils/hex";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("Password hashing and verification", () => {
	it("should hash a password", async () => {
		const password = "mySecurePassword123!";
		const hash = await hashPassword(password);
		expect(hash).toBeTruthy();
		expect(hash.split(":").length).toBe(2);
	});

	it("should verify a correct password", async () => {
		const password = "correctPassword123!";
		const hash = await hashPassword(password);
		const isValid = await verifyPassword({ hash, password });
		expect(isValid).toBe(true);
	});

	it("should reject an incorrect password", async () => {
		const correctPassword = "correctPassword123!";
		const incorrectPassword = "wrongPassword456!";
		const hash = await hashPassword(correctPassword);
		const isValid = await verifyPassword({ hash, password: incorrectPassword });
		expect(isValid).toBe(false);
	});

	it("should generate different hashes for the same password", async () => {
		const password = "samePassword123!";
		const hash1 = await hashPassword(password);
		const hash2 = await hashPassword(password);
		expect(hash1).not.toBe(hash2);
	});

	it("should handle long passwords", async () => {
		const password = "a".repeat(1000);
		const hash = await hashPassword(password);
		const isValid = await verifyPassword({ hash, password });
		expect(isValid).toBe(true);
	});

	it("should be case-sensitive", async () => {
		const password = "CaseSensitivePassword123!";
		const hash = await hashPassword(password);
		const isValidLower = await verifyPassword({
			hash,
			password: password.toLowerCase(),
		});
		const isValidUpper = await verifyPassword({
			hash,
			password: password.toUpperCase(),
		});
		expect(isValidLower).toBe(false);
		expect(isValidUpper).toBe(false);
	});

	it("should handle Unicode characters", async () => {
		/* cspell:disable-next-line */
		const password = "пароль123!";
		const hash = await hashPassword(password);
		const isValid = await verifyPassword({ hash, password });
		expect(isValid).toBe(true);
	});
});

describe("Backward compatibility with @noble/hashes", () => {
	const config = { N: 16384, r: 16, p: 1, dkLen: 64 };

	/**
	 * Simulate the OLD hashPassword implementation using @noble/hashes directly.
	 * This is what existing password hashes in user databases were created with.
	 */
	async function legacyHashPassword(password: string): Promise<string> {
		const salt = hex.encode(crypto.getRandomValues(new Uint8Array(16)));
		const key = await scryptAsync(password.normalize("NFKC"), salt, {
			...config,
			maxmem: 128 * config.N * config.r * 2,
		});
		return `${salt}:${hex.encode(key)}`;
	}

	it("should verify a hash created by the old @noble/hashes implementation", async () => {
		const password = "ExistingUser123!";
		const legacyHash = await legacyHashPassword(password);

		const isValid = await verifyPassword({ hash: legacyHash, password });
		expect(isValid).toBe(true);
	});

	it("should reject wrong password against old hash", async () => {
		const password = "ExistingUser123!";
		const legacyHash = await legacyHashPassword(password);

		const isValid = await verifyPassword({
			hash: legacyHash,
			password: "WrongPassword!",
		});
		expect(isValid).toBe(false);
	});

	it("should verify old hash with Unicode password", async () => {
		/* cspell:disable-next-line */
		const password = "비밀번호🔑密码🔒パスワード";
		const legacyHash = await legacyHashPassword(password);

		const isValid = await verifyPassword({ hash: legacyHash, password });
		expect(isValid).toBe(true);
	});

	it("should verify old hash with empty password", async () => {
		const password = "";
		const legacyHash = await legacyHashPassword(password);

		const isValid = await verifyPassword({ hash: legacyHash, password });
		expect(isValid).toBe(true);
	});

	it("should verify old hash with very long password", async () => {
		const password = "x".repeat(10000);
		const legacyHash = await legacyHashPassword(password);

		const isValid = await verifyPassword({ hash: legacyHash, password });
		expect(isValid).toBe(true);
	});
});
