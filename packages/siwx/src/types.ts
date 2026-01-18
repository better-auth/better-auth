export type ChainType = "evm" | "solana";

export type SignatureType =
	| "evm:eip191"
	| "evm:eip1271"
	| "solana:ed25519"
	| string;

export type NativeWalletProvider = "phantom" | "solflare" | "backpack";

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

export interface NativeCallbackOptions {
	/**
	 * Base58-encoded public key for the app
	 * Used by wallet apps to encrypt their response
	 */
	appPublicKeyBase58: string;
	/**
	 * Base58-encoded private key for the app
	 * Used to decrypt wallet responses
	 */
	appPrivateKeyBase58: string;
	/**
	 * Allowed native wallet providers
	 * @default ["phantom", "solflare", "backpack"]
	 */
	providers?: NativeWalletProvider[] | undefined;
	/**
	 * URL to redirect to on successful authentication
	 * @default "/?success=true"
	 */
	successRedirect?: string | undefined;
	/**
	 * URL to redirect to on authentication error
	 * @default "/login?success=false"
	 */
	errorRedirect?: string | undefined;
}
