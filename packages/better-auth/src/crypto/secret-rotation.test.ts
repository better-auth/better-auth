import { describe, expect, it } from "vitest";
import type { SecretConfig } from "@better-auth/core";
import {
	formatEnvelope,
	parseEnvelope,
	symmetricDecrypt,
	symmetricEncrypt,
} from "./index";
import { symmetricDecodeJWT, symmetricEncodeJWT } from "./jwt";

describe("secret rotation", () => {
	const secretA = "secret-a-at-least-32-chars-long!!";
	const secretB = "secret-b-at-least-32-chars-long!!";

	describe("envelope format", () => {
		it("parseEnvelope returns null for bare hex", () => {
			expect(parseEnvelope("abcdef1234567890")).toBeNull();
		});

		it("parseEnvelope parses valid envelope", () => {
			const result = parseEnvelope("$ba$2$abcdef1234567890");
			expect(result).toEqual({ version: 2, ciphertext: "abcdef1234567890" });
		});

		it("parseEnvelope rejects negative version", () => {
			expect(parseEnvelope("$ba$-1$abcdef")).toBeNull();
		});

		it("parseEnvelope rejects non-integer version", () => {
			expect(parseEnvelope("$ba$abc$abcdef")).toBeNull();
		});

		it("formatEnvelope produces correct format", () => {
			expect(formatEnvelope(3, "deadbeef")).toBe("$ba$3$deadbeef");
		});
	});

	describe("symmetricEncrypt / symmetricDecrypt", () => {
		it("single secret string - bare hex, no envelope", async () => {
			const encrypted = await symmetricEncrypt({
				key: secretA,
				data: "hello world",
			});
			expect(encrypted).not.toContain("$ba$");
			const decrypted = await symmetricDecrypt({
				key: secretA,
				data: encrypted,
			});
			expect(decrypted).toBe("hello world");
		});

		it("SecretConfig with one key - produces envelope", async () => {
			const config: SecretConfig = {
				keys: new Map([[1, secretA]]),
				currentVersion: 1,
			};
			const encrypted = await symmetricEncrypt({
				key: config,
				data: "hello world",
			});
			expect(encrypted).toMatch(/^\$ba\$1\$/);
			const decrypted = await symmetricDecrypt({
				key: config,
				data: encrypted,
			});
			expect(decrypted).toBe("hello world");
		});

		it("rotation - encrypt with version 2, decrypt with both keys", async () => {
			const config: SecretConfig = {
				keys: new Map([
					[2, secretB],
					[1, secretA],
				]),
				currentVersion: 2,
			};
			const encrypted = await symmetricEncrypt({
				key: config,
				data: "rotated data",
			});
			expect(encrypted).toMatch(/^\$ba\$2\$/);
			const decrypted = await symmetricDecrypt({
				key: config,
				data: encrypted,
			});
			expect(decrypted).toBe("rotated data");
		});

		it("decrypt old key - data encrypted with v1, config now on v2", async () => {
			const oldConfig: SecretConfig = {
				keys: new Map([[1, secretA]]),
				currentVersion: 1,
			};
			const encrypted = await symmetricEncrypt({
				key: oldConfig,
				data: "old data",
			});

			const newConfig: SecretConfig = {
				keys: new Map([
					[2, secretB],
					[1, secretA],
				]),
				currentVersion: 2,
			};
			const decrypted = await symmetricDecrypt({
				key: newConfig,
				data: encrypted,
			});
			expect(decrypted).toBe("old data");
		});

		it("legacy bare hex + SecretConfig with legacySecret", async () => {
			const bareHex = await symmetricEncrypt({
				key: secretA,
				data: "legacy data",
			});
			const config: SecretConfig = {
				keys: new Map([[2, secretB]]),
				currentVersion: 2,
				legacySecret: secretA,
			};
			const decrypted = await symmetricDecrypt({
				key: config,
				data: bareHex,
			});
			expect(decrypted).toBe("legacy data");
		});

		it("legacy bare hex without legacySecret - throws", async () => {
			const bareHex = await symmetricEncrypt({
				key: secretA,
				data: "legacy data",
			});
			const config: SecretConfig = {
				keys: new Map([[2, secretB]]),
				currentVersion: 2,
			};
			await expect(
				symmetricDecrypt({ key: config, data: bareHex }),
			).rejects.toThrow("no legacy secret available");
		});

		it("unknown version in envelope - throws", async () => {
			const config: SecretConfig = {
				keys: new Map([[1, secretA]]),
				currentVersion: 1,
			};
			const encrypted = await symmetricEncrypt({ key: config, data: "test" });

			const retiredConfig: SecretConfig = {
				keys: new Map([[2, secretB]]),
				currentVersion: 2,
			};
			await expect(
				symmetricDecrypt({ key: retiredConfig, data: encrypted }),
			).rejects.toThrow("key may have been retired");
		});

		it("version gaps work fine", async () => {
			const config: SecretConfig = {
				keys: new Map([
					[3, secretB],
					[1, secretA],
				]),
				currentVersion: 3,
			};
			const encrypted = await symmetricEncrypt({
				key: config,
				data: "gapped",
			});
			expect(encrypted).toMatch(/^\$ba\$3\$/);
			const decrypted = await symmetricDecrypt({
				key: config,
				data: encrypted,
			});
			expect(decrypted).toBe("gapped");
		});
	});

	describe("JWE multi-secret", () => {
		it("encode and decode with single secret string", async () => {
			const token = await symmetricEncodeJWT(
				{ foo: "bar" },
				secretA,
				"test-salt",
				3600,
			);
			const decoded = await symmetricDecodeJWT<{ foo: string }>(
				token,
				secretA,
				"test-salt",
			);
			expect(decoded?.foo).toBe("bar");
		});

		it("encode with SecretConfig, decode with same config", async () => {
			const config: SecretConfig = {
				keys: new Map([[1, secretA]]),
				currentVersion: 1,
			};
			const token = await symmetricEncodeJWT(
				{ foo: "bar" },
				config,
				"test-salt",
				3600,
			);
			const decoded = await symmetricDecodeJWT<{ foo: string }>(
				token,
				config,
				"test-salt",
			);
			expect(decoded?.foo).toBe("bar");
		});

		it("decode with rotated config containing old key", async () => {
			const oldConfig: SecretConfig = {
				keys: new Map([[1, secretA]]),
				currentVersion: 1,
			};
			const token = await symmetricEncodeJWT(
				{ foo: "bar" },
				oldConfig,
				"test-salt",
				3600,
			);

			const newConfig: SecretConfig = {
				keys: new Map([
					[2, secretB],
					[1, secretA],
				]),
				currentVersion: 2,
			};
			const decoded = await symmetricDecodeJWT<{ foo: string }>(
				token,
				newConfig,
				"test-salt",
			);
			expect(decoded?.foo).toBe("bar");
		});

		it("decode kid-less JWT tries all secrets (fallback)", async () => {
			// Simulate a legacy JWT without kid by encoding with plain string
			const token = await symmetricEncodeJWT(
				{ foo: "bar" },
				secretA,
				"test-salt",
				3600,
			);

			// Config where secretA is NOT the first/current secret
			const config: SecretConfig = {
				keys: new Map([
					[2, secretB],
					[1, secretA],
				]),
				currentVersion: 2,
				legacySecret: secretA,
			};
			const decoded = await symmetricDecodeJWT<{ foo: string }>(
				token,
				config,
				"test-salt",
			);
			expect(decoded?.foo).toBe("bar");
		});

		it("decode legacy string-encoded JWT with SecretConfig legacySecret", async () => {
			const token = await symmetricEncodeJWT(
				{ foo: "bar" },
				secretA,
				"test-salt",
				3600,
			);

			const config: SecretConfig = {
				keys: new Map([[2, secretB]]),
				currentVersion: 2,
				legacySecret: secretA,
			};
			const decoded = await symmetricDecodeJWT<{ foo: string }>(
				token,
				config,
				"test-salt",
			);
			expect(decoded?.foo).toBe("bar");
		});

		it("rejects token with mismatched kid (no fallback)", async () => {
			// Encode with secretA using a SecretConfig (so it gets a kid)
			const configA: SecretConfig = {
				keys: new Map([[1, secretA]]),
				currentVersion: 1,
			};
			const token = await symmetricEncodeJWT(
				{ foo: "bar" },
				configA,
				"test-salt",
				3600,
			);

			// Try to decode with a config that only has secretB (different key, kid won't match)
			const configB: SecretConfig = {
				keys: new Map([[2, secretB]]),
				currentVersion: 2,
			};
			const decoded = await symmetricDecodeJWT<{ foo: string }>(
				token,
				configB,
				"test-salt",
			);
			expect(decoded).toBeNull();
		});
	});
});
