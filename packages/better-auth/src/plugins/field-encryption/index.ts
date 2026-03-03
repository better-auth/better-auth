import type { BetterAuthPlugin, SecretConfig } from "@better-auth/core";
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import {
	parseEnvelope,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../crypto";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"field-encryption": {
			creator: typeof fieldEncryption;
		};
	}
}

export type FieldEncryptionOptions = {
	/**
	 * Encryption key. Accepts either:
	 * - A plain string secret (at least 16 characters recommended)
	 * - A SecretConfig object for key rotation support
	 *
	 * If not provided, falls back to the auth instance's
	 * configured secret (ctx.secretConfig).
	 */
	encryptionKey?: string | SecretConfig | undefined;
	/**
	 * Map of model names to arrays of field names that should be encrypted.
	 *
	 * @example
	 * ```ts
	 * fields: {
	 *   user: ["phoneNumber", "ssn"],
	 *   account: ["accessToken"],
	 * }
	 * ```
	 */
	fields: Record<string, string[]>;
};

/**
 * Check if a string looks like encrypted data (envelope or bare hex).
 * Matches the pattern used by better-auth's symmetric encryption.
 */
function isLikelyEncrypted(value: string): boolean {
	if (parseEnvelope(value) !== null) return true;
	return (
		value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value)
	);
}

/**
 * Field-level encryption plugin for Better Auth.
 *
 * Provides transparent encryption at rest for any schema field.
 * Uses XChaCha20-Poly1305 (the same algorithm used internally
 * by Better Auth for OAuth token encryption), with support for
 * key rotation via SecretConfig.
 *
 * Encrypted values are stored as hex strings with an optional
 * `$ba$<version>$` envelope prefix for versioned keys.
 *
 * Fields are encrypted before database writes and decrypted
 * after reads via schema transforms. Unencrypted values are
 * passed through transparently, enabling gradual migration.
 *
 * @example
 * ```ts
 * import { fieldEncryption } from "better-auth/plugins";
 *
 * const auth = betterAuth({
 *   plugins: [
 *     fieldEncryption({
 *       fields: {
 *         user: ["phoneNumber", "ssn"],
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export const fieldEncryption = (options: FieldEncryptionOptions) => {
	// Mutable reference — set from options or populated by init()
	// when falling back to the auth instance secret. By the time any
	// transform runs, init() has already executed.
	let encryptionKey: string | SecretConfig | undefined = options.encryptionKey;

	const getKey = (): string | SecretConfig => {
		if (!encryptionKey) {
			throw new Error(
				"[field-encryption] No encryption key configured. " +
					"Provide encryptionKey in plugin options or configure " +
					"a secret on the auth instance.",
			);
		}
		return encryptionKey;
	};

	// Build schema with transforms for each configured field
	const schema: BetterAuthPluginDBSchema = {};

	for (const [model, fieldNames] of Object.entries(options.fields)) {
		const fields: BetterAuthPluginDBSchema[string]["fields"] = {};

		for (const fieldName of fieldNames) {
			fields[fieldName] = {
				type: "string",
				required: false,
				transform: {
					async input(value) {
						if (value == null || value === "") return value;
						const str = typeof value === "string" ? value : String(value);
						if (isLikelyEncrypted(str)) return str;
						return symmetricEncrypt({ key: getKey(), data: str });
					},
					async output(value) {
						if (value == null || value === "") return value;
						if (typeof value !== "string") return value;
						if (!isLikelyEncrypted(value)) return value;
						try {
							return await symmetricDecrypt({
								key: getKey(),
								data: value,
							});
						} catch {
							// If decryption fails, return as-is. This handles
							// migration where some rows have unencrypted data
							// that coincidentally looks like hex.
							return value;
						}
					},
				},
			};
		}

		schema[model] = { fields };
	}

	return {
		id: "field-encryption",
		init(ctx) {
			if (!encryptionKey) {
				encryptionKey = ctx.secretConfig;
			}
		},
		schema,
		options,
	} satisfies BetterAuthPlugin;
};
