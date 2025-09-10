import type { GenericOAuthConfig } from "../plugins/generic-oauth";
import type { ProviderOptions } from "../oauth2";

export interface SocialProviderClientConfig
	extends Omit<GenericOAuthConfig, "providerId"> {
	options?: Record<string, any>;
}

export interface SocialProviderMultipleClientOptions<
	T extends Record<string, any> = any,
> extends Omit<ProviderOptions<T>, "clientId" | "clientSecret"> {
	clientId?: string;
	clientSecret?: string;
	scopes?: string[];
	redirectURI?: string;
	configs?: SocialProviderClientConfig[];
}

export function getAllClientIds(
	options: SocialProviderMultipleClientOptions,
): string[] {
	const clientIds: string[] = [];

	if (options.clientId) {
		clientIds.push(options.clientId);
	}

	if (options.configs) {
		clientIds.push(...options.configs.map((config) => config.clientId));
	}

	return clientIds;
}

export function findClientConfig(
	options: SocialProviderMultipleClientOptions,
	clientId: string,
): SocialProviderClientConfig {
	const foundClientConfig = options.configs?.find(
		(config) => config.clientId === clientId,
	);
	return (
		foundClientConfig || {
			clientId: options.clientId || "",
			clientSecret: options.clientSecret,
			scopes: options.scopes,
			redirectURI: options.redirectURI,
		}
	);
}

export function isValidClientId(
	options: SocialProviderMultipleClientOptions,
	clientId: string,
): boolean {
	return getAllClientIds(options).includes(clientId);
}

export function resolvePrimaryClientConfig(
	requestedClientId: string,
	options: SocialProviderMultipleClientOptions,
): SocialProviderClientConfig {
	if (!requestedClientId) {
		return {
			clientId: options.clientId || "",
			clientSecret: options.clientSecret,
			scopes: options.scopes,
			redirectURI: options.redirectURI,
		};
	}
	return findClientConfig(options, requestedClientId);
}
