export type ChainType = "evm" | "solana";

export type SignatureType =
	| "evm:eip191"
	| "evm:eip1271"
	| "solana:ed25519"
	| string;

export interface CacaoHeader {
	t: "caip122";
}

export interface CacaoPayload {
	domain: string;
	iss: string;
	aud: string;
	version: string;
	nonce: string;
	iat: string;
	nbf?: string | undefined;
	exp?: string | undefined;
	statement?: string | undefined;
	requestId?: string | undefined;
	resources?: string[] | undefined;
}

export interface CacaoSignature {
	t: SignatureType;
	s: string;
	m?: string | undefined;
}

export interface Cacao {
	h: CacaoHeader;
	p: CacaoPayload;
	s: CacaoSignature;
}

export interface SIWXVerifyMessageArgs {
	message: string;
	signature: string;
	address: string;
	chainType: ChainType;
	chainId: string;
	signatureType: SignatureType;
	cacao: Cacao;
}

export interface NameLookupArgs {
	address: string;
	chainType: ChainType;
	chainId: string;
}

export interface NameLookupResult {
	name?: string | undefined;
	avatar?: string | undefined;
}
