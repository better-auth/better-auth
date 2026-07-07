/**
 * SIWS (Sign In With Solana) Plugin Type Definitions
 */

export interface SolanaWalletAddress {
	id: string;
	userId: string;
	address: string;
	isPrimary: boolean;
	createdAt: Date;
}

/** Mirrors @solana/wallet-standard-features SolanaSignInInput */
export interface SolanaSignInInput {
	domain?: string | undefined;
	address?: string | undefined;
	statement?: string | undefined;
	uri?: string | undefined;
	version?: string | undefined;
	nonce?: string | undefined;
	chainId?: string | undefined;
	issuedAt?: string | undefined;
	expirationTime?: string | undefined;
	notBefore?: string | undefined;
	requestId?: string | undefined;
	resources?: readonly string[] | undefined;
}

/** Mirrors @solana/wallet-standard-features SolanaSignInOutput */
export interface SolanaSignInOutput {
	account: {
		address: string;
		publicKey: Uint8Array;
		chains: readonly `${string}:${string}`[];
		features: readonly `${string}:${string}`[];
		label?: string | undefined;
		icon?:
			| `data:image/${"svg+xml" | "webp" | "png" | "gif"};base64,${string}`
			| undefined;
	};
	signature: Uint8Array;
	signedMessage: Uint8Array;
	signatureType?: "ed25519" | undefined;
}

export interface SIWSVerifyArgs {
	input: SolanaSignInInput;
	output: SolanaSignInOutput;
}
