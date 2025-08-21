import type { base } from ".";
import type { BetterAuthClientPlugin } from "../../types";
import type { BaseProvider, BaseSignInResult } from "./types";
import { BASE_MAINNET_CHAIN_ID } from ".";

// Extend Window interface for ethereum provider
declare global {
	interface Window {
		ethereum?: {
			request: (args: { method: string; params?: any[] }) => Promise<any>;
		};
	}
}

/**
 * Base client plugin with Base Account SDK integration
 */
export const baseClient = () => {
	return {
		id: "base",
		$InferServerPlugin: {} as ReturnType<typeof base>,
		getActions: ($fetch) => ({
			base: {
				signInWithBase: signInWithBase,
				getBaseProvider: getBaseProvider,
				isBaseAccountSupported: isBaseAccountSupported,
			},
		}),
	} satisfies BetterAuthClientPlugin;
};

/**
 * Sign in with Base using wallet_connect method
 * Compatible with Base Account SDK
 */
export async function signInWithBase(options?: {
	nonce?: string;
	chainId?: number;
}): Promise<BaseSignInResult> {
	const chainId = options?.chainId || BASE_MAINNET_CHAIN_ID;

	// Get or generate nonce
	let nonce = options?.nonce;
	if (!nonce) {
		const response = await fetch("/api/auth/siwe/nonce");
		if (!response.ok) {
			throw new Error("Failed to get nonce");
		}
		const data = await response.json();
		nonce = data.nonce;
	}

	try {
		// Try wallet_connect method first (Base Account SDK)
		const provider = await getBaseProvider();

		const result = await provider.request({
			method: "wallet_connect",
			params: [
				{
					version: "1",
					capabilities: {
						signInWithEthereum: {
							nonce: nonce!,
							chainId: `0x${chainId.toString(16)}`, // Convert to hex
						},
					},
				},
			],
		});

		const account = result.accounts[0];
		const { address } = account;
		const { message, signature } = account.capabilities.signInWithEthereum;

		// Verify with server
		const verifyResponse = await fetch("/api/auth/siwe/verify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ address, message, signature }),
		});

		if (!verifyResponse.ok) {
			throw new Error("Base authentication failed");
		}

		return {
			address,
			message,
			signature,
			chainId,
		};
	} catch (error) {
		// Fallback to standard SIWE if wallet_connect fails
		if (
			error instanceof Error &&
			error.message.includes("method_not_supported")
		) {
			return signInWithBaseFallback({ nonce: nonce, chainId });
		}
		throw error;
	}
}

/**
 * Get Base Account SDK provider
 */
export async function getBaseProvider(): Promise<BaseProvider> {
	try {
		// @ts-ignore - Dynamic import for optional dependency
		const { createBaseAccountSDK } = await import("@base-org/account");
		const sdk = createBaseAccountSDK();
		return sdk.getProvider() as BaseProvider;
	} catch (error) {
		throw new Error(
			"Base Account SDK not found. Install with: npm install @base-org/account",
		);
	}
}

/**
 * Check if Base Account is supported
 */
export async function isBaseAccountSupported(): Promise<boolean> {
	try {
		// @ts-ignore - Dynamic import for optional dependency
		await import("@base-org/account");
		return true;
	} catch {
		return false;
	}
}

/**
 * Fallback SIWE implementation for wallets that don't support wallet_connect
 * Uses eth_requestAccounts + personal_sign as per EIP-4361 standard
 *
 * @param options - Optional configuration for fallback authentication
 * @returns Promise resolving to Base sign-in result
 */
export async function signInWithBaseFallback(options?: {
	nonce?: string;
	chainId?: number;
}): Promise<BaseSignInResult> {
	const chainId = options?.chainId || BASE_MAINNET_CHAIN_ID;

	if (typeof window === "undefined" || !window.ethereum) {
		throw new Error("Ethereum provider not found");
	}

	const provider = window.ethereum;

	// Request account access
	const accounts = await provider.request({
		method: "eth_requestAccounts",
	});

	const address = accounts[0];

	// Get nonce
	let nonce = options?.nonce;
	if (!nonce) {
		const response = await fetch("/api/auth/siwe/nonce");
		if (!response.ok) {
			throw new Error("Failed to get nonce");
		}
		const data = await response.json();
		nonce = data.nonce;
	}

	// Create SIWE message
	const domain = window.location.host;
	const origin = window.location.origin;
	const statement = "Sign in with Ethereum to Base";

	const message = createSiweMessage({
		domain,
		address,
		statement,
		uri: origin,
		version: "1",
		chainId,
		nonce: nonce!,
	});

	// Sign message
	const signature = await provider.request({
		method: "personal_sign",
		params: [message, address],
	});

	// Verify with server
	const verifyResponse = await fetch("/api/auth/siwe/verify", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ address, message, signature }),
	});

	if (!verifyResponse.ok) {
		throw new Error("Base authentication failed");
	}

	return {
		address,
		message,
		signature,
		chainId,
	};
}

/**
 * Create SIWE message according to EIP-4361
 */
function createSiweMessage(params: {
	domain: string;
	address: string;
	statement: string;
	uri: string;
	version: string;
	chainId: number;
	nonce: string;
}): string {
	const { domain, address, statement, uri, version, chainId, nonce } = params;

	return [
		`${domain} wants you to sign in with your Ethereum account:`,
		address,
		"",
		statement,
		"",
		`URI: ${uri}`,
		`Version: ${version}`,
		`Chain ID: ${chainId}`,
		`Nonce: ${nonce}`,
		`Issued At: ${new Date().toISOString()}`,
	].join("\n");
}
