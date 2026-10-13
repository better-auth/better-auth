import type { SecretConfig } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { symmetricDecrypt, symmetricEncrypt } from "./index";
import type { EncryptionPurpose } from "./purpose";
import { derivePurposeKey } from "./purpose";

const purposes: EncryptionPurpose[] = [
	"oauth-state-cookie",
	"oauth-proxy-state",
	"oauth-proxy-package",
	"oauth-proxy-profile",
];

/**
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-r4xp-prcw-77qf
 */
describe("OAuth encryption purposes", () => {
	it.each(purposes)("decrypts %s only for its own purpose", async (purpose) => {
		const secret = "shared-secret-at-least-32-characters";
		const ciphertext = await symmetricEncrypt({
			key: derivePurposeKey(secret, purpose),
			data: "synthetic payload",
		});
		expect(
			await symmetricDecrypt({
				key: derivePurposeKey(secret, purpose),
				data: ciphertext,
			}),
		).toBe("synthetic payload");
		for (const otherPurpose of purposes.filter((other) => other !== purpose)) {
			await expect(
				symmetricDecrypt({
					key: derivePurposeKey(secret, otherPurpose),
					data: ciphertext,
				}),
			).rejects.toThrow();
		}
		await expect(
			symmetricDecrypt({ key: secret, data: ciphertext }),
		).rejects.toThrow();
	});

	it.each(
		purposes,
	)("decrypts bare %s ciphertext with its purpose-derived legacy key", async (purpose) => {
		const oldSecret = "old-secret-at-least-32-characters!!";
		const rotatedConfig: SecretConfig = {
			keys: new Map([[2, "new-secret-at-least-32-characters!!"]]),
			currentVersion: 2,
			legacySecret: oldSecret,
		};
		const ciphertext = await symmetricEncrypt({
			key: derivePurposeKey(oldSecret, purpose),
			data: "in-flight derived profile",
		});
		expect(ciphertext).not.toMatch(/^\$ba\$/);
		expect(
			await symmetricDecrypt({
				key: derivePurposeKey(rotatedConfig, purpose),
				data: ciphertext,
			}),
		).toBe("in-flight derived profile");
		await expect(
			symmetricDecrypt({
				key: derivePurposeKey(
					rotatedConfig,
					purpose === "oauth-proxy-package"
						? "oauth-state-cookie"
						: "oauth-proxy-package",
				),
				data: ciphertext,
			}),
		).rejects.toThrow();
	});

	it.each(
		purposes,
	)("preserves %s rotation without accepting the shared key", async (purpose) => {
		const oldSecret = "old-secret-at-least-32-characters!!";
		const newSecret = "new-secret-at-least-32-characters!!";
		const oldConfig: SecretConfig = {
			keys: new Map([[1, oldSecret]]),
			currentVersion: 1,
		};
		const rotatedConfig: SecretConfig = {
			keys: new Map([
				[2, newSecret],
				[1, oldSecret],
			]),
			currentVersion: 2,
			legacySecret: oldSecret,
		};
		const oldCiphertext = await symmetricEncrypt({
			key: derivePurposeKey(oldConfig, purpose),
			data: "old profile",
		});
		expect(oldCiphertext).toMatch(/^\$ba\$1\$/);
		expect(
			await symmetricDecrypt({
				key: derivePurposeKey(rotatedConfig, purpose),
				data: oldCiphertext,
			}),
		).toBe("old profile");
		await expect(
			symmetricDecrypt({
				key: derivePurposeKey(
					rotatedConfig,
					purpose === "oauth-proxy-package"
						? "oauth-state-cookie"
						: "oauth-proxy-package",
				),
				data: oldCiphertext,
			}),
		).rejects.toThrow();
		const legacyCiphertext = await symmetricEncrypt({
			key: oldSecret,
			data: "pre-upgrade profile",
		});
		await expect(
			symmetricDecrypt({
				key: derivePurposeKey(rotatedConfig, purpose),
				data: legacyCiphertext,
			}),
		).rejects.toThrow();
	});
});
