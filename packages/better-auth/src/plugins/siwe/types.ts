/**
 * SIWE Plugin Type Definitions
 */

export interface WalletAddress {
	id: string;
	userId: string;
	address: string;
	chainId: number;
	isPrimary: boolean;
	createdAt: Date;
}

interface CacaoHeader {
	t: "caip122";
}

// Signed Cacao (CAIP-74)
interface CacaoPayload {
	domain: string;
	aud: string;
	nonce: string;
	iss: string;
	version?: string | undefined;
	iat?: string | undefined;
	nbf?: string | undefined;
	exp?: string | undefined;
	statement?: string | undefined;
	requestId?: string | undefined;
	resources?: string[] | undefined;
	type?: string | undefined;
}

interface Cacao {
	h: CacaoHeader;
	p: CacaoPayload;
	s: {
		t: "eip191" | "eip1271";
		s: string;
		m?: string | undefined;
	};
}

export interface SIWEVerifyMessageArgs {
	message: string;
	signature: string;
	address: string;
	chainId: number;
	cacao?: Cacao | undefined;
}

export interface ENSLookupArgs {
	walletAddress: string;
}

export interface ENSLookupResult {
	name: string;
	avatar: string;
}
