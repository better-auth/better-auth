import { describe, expect, it } from "vitest";
import type { SecretConfig } from "@better-auth/core";
import {
	formatEnvelope,
	parseEnvelope,
	symmetricDecrypt,
	symmetricEncrypt,
} from "./index";
import { symmetricDecodeJWT, symmetricEncodeJWT } from "./jwt";
import {
	parseSecretsEnv,
	validateSecretsArray,
	buildSecretConfig,
} from "../context/secret-utils";

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

	describe("context secret helpers", () => {
		describe("parseSecretsEnv", () => {
			it("returns null for undefined/empty", () => {
				expect(parseSecretsEnv(undefined)).toBeNull();
				expect(parseSecretsEnv("")).toBeNull();
			});

			it("trims whitespace around entries and values", () => {
				const result = parseSecretsEnv("1: foo , 2:bar ");
				expect(result).toEqual([
					{ version: 1, value: "foo" },
					{ version: 2, value: "bar" },
				]);
			});

			it("rejects entry without colon", () => {
				expect(() => parseSecretsEnv("noseparator")).toThrow("Expected format");
			});

			it("rejects negative version", () => {
				expect(() => parseSecretsEnv("-1:secret")).toThrow(
					"non-negative integer",
				);
			});

			it("rejects non-integer version", () => {
				expect(() => parseSecretsEnv("abc:secret")).toThrow(
					"non-negative integer",
				);
			});

			it("rejects empty value", () => {
				expect(() => parseSecretsEnv("1:")).toThrow("Empty secret value");
			});
		});

		describe("validateSecretsArray", () => {
			// validateSecretsArray needs a logger. Create a mock:
			const mockLogger = {
				warn: () => {},
				error: () => {},
				info: () => {},
				debug: () => {},
			} as any;

			it("throws on empty array", () => {
				expect(() => validateSecretsArray([], mockLogger)).toThrow(
					"at least one entry",
				);
			});

			it("throws on duplicate versions", () => {
				expect(() =>
					validateSecretsArray(
						[
							{ version: 1, value: "secret-a-at-least-32-chars-long!!" },
							{ version: 1, value: "secret-b-at-least-32-chars-long!!" },
						],
						mockLogger,
					),
				).toThrow("Duplicate version");
			});

			it("throws on negative version", () => {
				expect(() =>
					validateSecretsArray(
						[{ version: -1, value: "secret-a-at-least-32-chars-long!!" }],
						mockLogger,
					),
				).toThrow("non-negative integer");
			});

			it("throws on empty value", () => {
				expect(() =>
					validateSecretsArray([{ version: 1, value: "" }], mockLogger),
				).toThrow("Empty secret value");
			});

			it("accepts valid config", () => {
				expect(() =>
					validateSecretsArray(
						[
							{ version: 2, value: "secret-b-at-least-32-chars-long!!" },
							{ version: 1, value: "secret-a-at-least-32-chars-long!!" },
						],
						mockLogger,
					),
				).not.toThrow();
			});

			it("coerces string versions to numbers", () => {
				const secrets = [
					{ version: "1" as any, value: "secret-a-at-least-32-chars-long!!" },
					{ version: "2" as any, value: "secret-b-at-least-32-chars-long!!" },
				];
				expect(() => validateSecretsArray(secrets, mockLogger)).not.toThrow();
				// After validation, versions should be coerced to numbers
				expect(secrets[0].version).toBe(1);
				expect(secrets[1].version).toBe(2);
			});

			it("detects duplicates after coercion", () => {
				expect(() =>
					validateSecretsArray(
						[
							{ version: "1" as any, value: "secret-a-at-least-32-chars-long!!" },
							{ version: 1, value: "secret-b-at-least-32-chars-long!!" },
						],
						mockLogger,
					),
				).toThrow("Duplicate version");
			});
		});

		describe("buildSecretConfig", () => {
			it("builds config with keys map", () => {
				const secrets = [
					{ version: 2, value: "secret-b-at-least-32-chars-long!!" },
					{ version: 1, value: "secret-a-at-least-32-chars-long!!" },
				];
				const config = buildSecretConfig(secrets, "");
				expect(config.currentVersion).toBe(2);
				expect(config.keys.get(1)).toBe("secret-a-at-least-32-chars-long!!");
				expect(config.keys.get(2)).toBe("secret-b-at-least-32-chars-long!!");
				expect(config.legacySecret).toBeUndefined();
			});

			it("includes legacySecret when provided", () => {
				const secrets = [
					{ version: 1, value: "secret-a-at-least-32-chars-long!!" },
				];
				const config = buildSecretConfig(
					secrets,
					"legacy-secret-at-least-32-chars!!",
				);
				expect(config.legacySecret).toBe("legacy-secret-at-least-32-chars!!");
			});

			it("excludes DEFAULT_SECRET as legacySecret", () => {
				const secrets = [
					{ version: 1, value: "secret-a-at-least-32-chars-long!!" },
				];
				// DEFAULT_SECRET value from constants
				const DEFAULT_SECRET = "better_auth_secret_at_least_32_characters_long";
				const config = buildSecretConfig(secrets, DEFAULT_SECRET);
				expect(config.legacySecret).toBeUndefined();
			});
		});
	});
});
