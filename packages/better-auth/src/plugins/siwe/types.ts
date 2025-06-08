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

// SIWE Session compatible with Reown spec
export interface SIWESession {
	address: string;
	chainId: number;
}

// Enhanced message parameters following Reown spec
export interface SIWEMessageParams {
	domain: string;
	uri: string;
	chains: number[];
	statement: string;
	nonce?: string;
	issuedAt?: string;
	expirationTime?: string;
	notBefore?: string;
	requestId?: string;
	resources?: string[];
}

export interface SIWECreateMessageArgs extends SIWEMessageParams {
	address: string;
	chainId: number;
}

interface CacaoHeader {
	t: 'caip122'
}

// Signed Cacao (CAIP-74)
interface CacaoPayload {
	domain: string
	aud: string
	nonce: string
	iss: string
	version?: string
	iat?: string
	nbf?: string
	exp?: string
	statement?: string
	requestId?: string
	resources?: string[]
	type?: string
}

interface Cacao {
	h: CacaoHeader
	p: CacaoPayload
	s: {
	  t: 'eip191' | 'eip1271'
	  s: string
	  m?: string
	}
}

export interface SIWEVerifyMessageArgs {
	message: string
	signature: string
	address: string
	chainId: number
	cacao?: Cacao
}

export interface ENSLookupArgs {
	walletAddress: string
}

export interface ENSLookupResult {
	name: string
	avatar: string
}
