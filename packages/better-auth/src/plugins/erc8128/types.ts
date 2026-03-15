import type {
	NonceStore,
	VerifyMessageFn,
	VerifyPolicy,
} from "@slicekit/erc8128";

export interface WalletAddress {
	id: string;
	userId: string;
	address: string;
	chainId: number;
	isPrimary: boolean;
	createdAt: Date;
}

export interface ENSLookupArgs {
	walletAddress: string;
}

export interface ENSLookupResult {
	name?: string;
	avatar?: string;
}

export type { NonceStore, VerifyMessageFn, VerifyPolicy };
