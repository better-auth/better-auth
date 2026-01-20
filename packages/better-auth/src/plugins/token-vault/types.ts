import type { InferOptionSchema } from "../../types/plugins";
import type { schema } from "./schema";

/**
 * Custom storage adapter for token vault
 * Allows using external secret stores like HashiCorp Vault, AWS Secrets Manager, etc.
 */
export interface TokenVaultStorage {
	/**
	 * Store a token grant
	 */
	store(grant: TokenVaultStorageGrant): Promise<void>;

	/**
	 * Retrieve a token grant
	 */
	retrieve(
		userId: string,
		agentId: string,
		provider: string,
	): Promise<TokenVaultStorageGrant | null>;

	/**
	 * Revoke a token grant
	 */
	revoke(grantId: string): Promise<void>;

	/**
	 * List all grants for a user
	 */
	listByUser(userId: string): Promise<TokenVaultStorageGrant[]>;

	/**
	 * List all grants for an agent
	 */
	listByAgent(agentId: string): Promise<TokenVaultStorageGrant[]>;

	/**
	 * Update last used timestamp
	 */
	updateLastUsed(grantId: string): Promise<void>;

	/**
	 * Delete a grant permanently
	 */
	delete(grantId: string): Promise<void>;
}

export interface TokenVaultStorageGrant {
	id: string;
	userId: string;
	agentId: string;
	provider: string;
	accessToken?: string;
	refreshToken?: string;
	idToken?: string;
	scopes: string[];
	accessTokenExpiresAt?: Date;
	refreshTokenExpiresAt?: Date;
	metadata?: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
	lastUsedAt?: Date;
	revokedAt?: Date;
}

export interface TokenVaultOptions {
	/**
	 * Encryption key for encrypting tokens at rest.
	 * Should be at least 32 characters for security.
	 * Uses XChaCha20-Poly1305 encryption.
	 */
	encryptionKey: string;

	/**
	 * Custom storage adapter for external secret stores.
	 * If provided, tokens will be stored in the external store
	 * instead of the database.
	 */
	storage?: TokenVaultStorage;

	/**
	 * Default TTL for access tokens.
	 * @default "1h"
	 */
	defaultAccessTokenTTL?: string;

	/**
	 * Default TTL for refresh tokens.
	 * @default "30d"
	 */
	defaultRefreshTokenTTL?: string;

	/**
	 * Whether to automatically clean up expired tokens.
	 * @default true
	 */
	cleanupExpiredTokens?: boolean;

	/**
	 * Interval for cleaning up expired tokens.
	 * @default "1h"
	 */
	cleanupInterval?: string;

	/**
	 * Hook called when a token is stored
	 */
	onTokenStored?: (grant: {
		userId: string;
		agentId: string;
		provider: string;
		scopes: string[];
	}) => void | Promise<void>;

	/**
	 * Hook called when a token is retrieved
	 */
	onTokenRetrieved?: (grant: {
		userId: string;
		agentId: string;
		provider: string;
	}) => void | Promise<void>;

	/**
	 * Hook called when a grant is revoked
	 */
	onGrantRevoked?: (grant: {
		userId: string;
		agentId: string;
		provider: string;
	}) => void | Promise<void>;

	/**
	 * Custom schema extensions
	 */
	schema?: InferOptionSchema<typeof schema>;
}
