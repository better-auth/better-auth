import { APIError } from "better-auth/api";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import type { EncryptedOIDCConfig, OIDCConfig, SSOOptions } from "../types";

async function defaultEncryptClientSecret(
	clientSecret: string,
	authSecret: string,
): Promise<string> {
	try {
		return await symmetricEncrypt({ key: authSecret, data: clientSecret });
	} catch {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Failed to encrypt client secret.",
		});
	}
}

async function defaultDecryptClientSecret(
	clientSecret: string,
	authSecret: string,
): Promise<string> {
	try {
		return await symmetricDecrypt({ key: authSecret, data: clientSecret });
	} catch {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message:
				"Failed to decrypt client secret. Ensure BETTER_AUTH_SECRET matches the key used during encryption. If this secret was stored with a custom `storeSecretAs` encryptor, that same encryptor must remain configured to decrypt it.",
		});
	}
}

function prepareEncryptionFns(
	authSecret: string,
	ssoOptions: SSOOptions,
): {
	encryptionFn: (str: string) => Promise<string>;
	decryptionFn: (str: string) => Promise<string>;
} {
	if (!ssoOptions.storeSecretAs || ssoOptions.storeSecretAs === "plain")
		return {
			encryptionFn: async (clientSecret: string) => clientSecret,
			decryptionFn: async (clientSecret: string) =>
				await defaultDecryptClientSecret(clientSecret, authSecret),
		};
	return typeof ssoOptions.storeSecretAs === "object"
		? {
				encryptionFn: ssoOptions.storeSecretAs.encrypt,
				decryptionFn: ssoOptions.storeSecretAs.decrypt,
			}
		: {
				encryptionFn: async (clientSecret: string) =>
					await defaultEncryptClientSecret(clientSecret, authSecret),
				decryptionFn: async (clientSecret: string) =>
					await defaultDecryptClientSecret(clientSecret, authSecret),
			};
}

export async function decryptOIDCConfig(
	potentiallyEncryptedOIDCConfig: OIDCConfig | EncryptedOIDCConfig,
	deps: { authSecret: string; ssoOptions: SSOOptions },
): Promise<OIDCConfig> {
	if (typeof potentiallyEncryptedOIDCConfig.clientSecret !== "object") {
		return potentiallyEncryptedOIDCConfig as OIDCConfig;
	}

	const { decryptionFn } = prepareEncryptionFns(
		deps.authSecret,
		deps.ssoOptions,
	);
	return {
		...potentiallyEncryptedOIDCConfig,
		clientSecret: await decryptionFn(
			potentiallyEncryptedOIDCConfig.clientSecret.value,
		),
	};
}

export function isEncryptionEnabled(ssoOptions: SSOOptions): boolean {
	return (
		ssoOptions.storeSecretAs === "encrypted" ||
		(typeof ssoOptions.storeSecretAs === "object" &&
			ssoOptions.storeSecretAs !== null)
	);
}

export function isEncryptedOIDCConfig(
	config: OIDCConfig | EncryptedOIDCConfig,
): config is EncryptedOIDCConfig {
	return (
		typeof config.clientSecret === "object" && config.clientSecret !== null
	);
}

export async function encryptOIDCConfig(
	oidcConfig: OIDCConfig,
	deps: { authSecret: string; ssoOptions: SSOOptions },
): Promise<OIDCConfig | EncryptedOIDCConfig> {
	if (!isEncryptionEnabled(deps.ssoOptions)) {
		return oidcConfig;
	}
	const { encryptionFn } = prepareEncryptionFns(
		deps.authSecret,
		deps.ssoOptions,
	);
	return {
		...oidcConfig,
		clientSecret: {
			encrypted: true,
			value: await encryptionFn(oidcConfig.clientSecret),
		},
	};
}
