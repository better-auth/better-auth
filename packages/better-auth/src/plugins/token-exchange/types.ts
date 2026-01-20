/**
 * Token types as defined in RFC 8693
 */
export const TOKEN_TYPES = {
	ACCESS_TOKEN: "urn:ietf:params:oauth:token-type:access_token",
	REFRESH_TOKEN: "urn:ietf:params:oauth:token-type:refresh_token",
	ID_TOKEN: "urn:ietf:params:oauth:token-type:id_token",
	JWT: "urn:ietf:params:oauth:token-type:jwt",
} as const;

export type TokenType = (typeof TOKEN_TYPES)[keyof typeof TOKEN_TYPES];

/**
 * Grant type for token exchange (RFC 8693)
 */
export const TOKEN_EXCHANGE_GRANT_TYPE =
	"urn:ietf:params:oauth:grant-type:token-exchange";

/**
 * Subject token information extracted from validation
 */
export interface SubjectTokenInfo {
	/** User ID from the token */
	userId: string;
	/** Scopes from the token */
	scopes: string[];
	/** Session ID if available */
	sessionId?: string;
	/** Original token */
	token: string;
	/** Token type */
	tokenType: TokenType;
}

/**
 * Actor token information
 */
export interface ActorTokenInfo {
	/** Agent/client ID */
	clientId: string;
	/** Subject (agent user ID) */
	sub: string;
	/** Original token */
	token: string;
	/** Token type */
	tokenType: TokenType;
}

/**
 * Exchange request context passed to validation hooks
 */
export interface TokenExchangeContext {
	/** Subject token info */
	subject: SubjectTokenInfo;
	/** Actor token info (if provided) */
	actor?: ActorTokenInfo;
	/** Requested scopes */
	requestedScopes: string[];
	/** Requested resource/audience */
	resource?: string;
	/** Requested audience */
	audience?: string;
}

/**
 * Token Exchange Plugin Options
 */
export interface TokenExchangeOptions {
	/**
	 * Lifetime of exchanged tokens
	 * @default "1h"
	 */
	exchangedTokenTTL?: string;

	/**
	 * Whether to require a grant in the Token Vault for exchange
	 * If true, the agent must have a valid grant to perform the exchange
	 * @default true
	 */
	requireVaultGrant?: boolean;

	/**
	 * Allowed subject token types for exchange
	 * @default ["urn:ietf:params:oauth:token-type:access_token"]
	 */
	allowedSubjectTokenTypes?: TokenType[];

	/**
	 * Custom validation function for exchange requests
	 * Return true to allow the exchange, false to deny
	 */
	validateExchange?: (ctx: TokenExchangeContext) => boolean | Promise<boolean>;

	/**
	 * Hook called after a successful token exchange
	 */
	onExchange?: (exchange: {
		subject: SubjectTokenInfo;
		actor?: ActorTokenInfo;
		scopes: string[];
		token: string;
	}) => void | Promise<void>;

	/**
	 * Custom function to generate the exchanged token
	 * If not provided, uses the default JWT signing
	 */
	generateToken?: (ctx: {
		subject: SubjectTokenInfo;
		actor?: ActorTokenInfo;
		scopes: string[];
		expiresIn: number;
	}) => string | Promise<string>;
}
