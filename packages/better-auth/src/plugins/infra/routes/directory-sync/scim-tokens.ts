import { base64Url } from "@better-auth/utils/base64";
import type { BetterAuthPlugin } from "better-auth";
import { generateRandomString, symmetricEncrypt } from "better-auth/crypto";
import { defaultKeyHasher } from "better-auth/plugins";
import type { SCIMPluginWithOptions, StoreSCIMToken } from "./types";

/**
 * Get the storeSCIMToken option from the SCIM plugin.
 */
export function getStoreSCIMTokenOption(
	scimPlugin: BetterAuthPlugin,
): StoreSCIMToken {
	const pluginWithOptions = scimPlugin as SCIMPluginWithOptions;
	return pluginWithOptions.options?.storeSCIMToken ?? "plain";
}

/**
 * Store the SCIM token using the same logic as the SCIM plugin.
 */
async function storeSCIMToken(
	baseToken: string,
	storageOption: StoreSCIMToken,
	secret: string,
): Promise<string> {
	if (storageOption === "encrypted") {
		return await symmetricEncrypt({ key: secret, data: baseToken });
	}
	if (storageOption === "hashed") {
		return await defaultKeyHasher(baseToken);
	}
	if (typeof storageOption === "object" && "hash" in storageOption) {
		return await storageOption.hash(baseToken);
	}
	if (typeof storageOption === "object" && "encrypt" in storageOption) {
		return await storageOption.encrypt(baseToken);
	}
	return baseToken;
}

/**
 * Generate a SCIM token in the same format as the SCIM plugin.
 * The token format is: base64Url(baseToken:providerId:organizationId)
 */
export async function generateScimToken(
	providerId: string,
	organizationId: string,
	storageOption: StoreSCIMToken,
	secret: string,
): Promise<{ token: string; storedToken: string }> {
	const baseToken = generateRandomString(24);
	const token = base64Url.encode(
		`${baseToken}:${providerId}:${organizationId}`,
	);
	const storedToken = await storeSCIMToken(baseToken, storageOption, secret);
	return { token, storedToken };
}

/**
 * Generate the SCIM endpoint URL from the base URL.
 */
export function getScimEndpoint(baseUrl: string): string {
	return `${baseUrl}/scim/v2`;
}
