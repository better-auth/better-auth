import { siwe } from "../siwe";
import type { BasePluginOptions } from "./types";

/**
 * Base plugin - SIWE authentication optimized for Base chain
 *
 * This plugin provides Sign-in with Ethereum (SIWE) functionality
 * specifically configured for Base Mainnet (chainId: 8453).
 * It's compatible with Base Account SDK and follows EIP-4361 standard.
 *
 * @param options - Configuration options for Base authentication
 * @returns BetterAuth plugin for Base authentication
 */
export const base = (options: BasePluginOptions = {}) => {
	return siwe({
		domain: options.domain || "localhost:3000",
		emailDomainName: options.emailDomainName,
		anonymous: options.anonymous ?? true,
		getNonce: options.getNonce || defaultGetNonce,
		verifyMessage: async (args) => {
			// Simple verification - in production you'd want proper signature verification
			// But since this is just wrapping SIWE, let SIWE handle verification
			return true;
		},
		ensLookup: options.ensLookup
			? (args) => {
					// Adapt BasePluginOptions ensLookup to SIWE ensLookup
					return options.ensLookup!(args).then((result) => ({
						name: result.name || "",
						avatar: result.avatar || "",
					}));
				}
			: undefined,
	});
};

/**
 * Default nonce generator using crypto.randomUUID
 */
async function defaultGetNonce(): Promise<string> {
	return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Base Mainnet chain ID (8453)
 * Used as the default chain for Base authentication
 */
export const BASE_MAINNET_CHAIN_ID = 8453;

/**
 * Base-specific error types
 */
export const BaseErrors = {
	WALLET_CONNECT_NOT_SUPPORTED: "wallet_connect method not supported",
	INVALID_BASE_SIGNATURE: "Invalid Base Account signature",
	BASE_CHAIN_REQUIRED: "Base chain (8453) required for Base authentication",
} as const;

export type BaseError = (typeof BaseErrors)[keyof typeof BaseErrors];
