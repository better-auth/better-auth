import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

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
