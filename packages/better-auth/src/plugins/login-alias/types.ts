import type { LoginAlias } from "./schema";

export interface AddAliasOptions {
	/**
	 * The user ID to add the alias to
	 */
	userId: string;
	/**
	 * Type of alias (email, username, phone, custom)
	 */
	type: string;
	/**
	 * The identifier value
	 */
	value: string;
	/**
	 * Whether the alias is already verified
	 * @default false
	 */
	verified?: boolean;
	/**
	 * Whether this should be the primary alias of this type
	 * @default false
	 */
	isPrimary?: boolean;
	/**
	 * Optional metadata (e.g., display value for case-sensitive usernames)
	 */
	metadata?: string;
}

export interface RemoveAliasOptions {
	/**
	 * The alias ID to remove
	 */
	aliasId: string;
	/**
	 * The user ID (for verification)
	 */
	userId: string;
}

export interface GetAliasesOptions {
	/**
	 * The user ID to get aliases for
	 */
	userId: string;
	/**
	 * Optional: filter by type
	 */
	type?: string;
}

export interface FindAliasOptions {
	/**
	 * The alias value to find
	 */
	value: string;
	/**
	 * Optional: filter by type
	 */
	type?: string;
}

export interface MakePrimaryOptions {
	/**
	 * The alias ID to make primary
	 */
	aliasId: string;
	/**
	 * The user ID (for verification)
	 */
	userId: string;
}

export interface VerifyAliasOptions {
	/**
	 * The alias ID to verify
	 */
	aliasId: string;
	/**
	 * The user ID (for verification)
	 */
	userId: string;
}

export interface LoginAliasPluginOptions {
	/**
	 * Whether to automatically create aliases for existing user identifiers
	 * @default true
	 */
	autoCreateAliases?: boolean;
	/**
	 * Whether to allow multiple aliases of the same type per user
	 * @default true
	 */
	allowMultiplePerType?: boolean;
	/**
	 * Types of aliases that are allowed
	 * @default ['email', 'username', 'phone']
	 */
	allowedTypes?: string[];
	/**
	 * Whether to require verification for new aliases before they can be used
	 * @default { email: true, phone: true, username: false }
	 */
	requireVerification?: {
		[type: string]: boolean;
	};
	/**
	 * Maximum number of aliases per user
	 * @default 10
	 */
	maxAliasesPerUser?: number;
	/**
	 * Custom normalization function for alias values
	 */
	normalizeValue?: (value: string, type: string) => string;
	/**
	 * Hook called when an alias is added
	 */
	onAliasAdded?: (alias: LoginAlias, userId: string) => Promise<void> | void;
	/**
	 * Hook called when an alias is removed
	 */
	onAliasRemoved?: (alias: LoginAlias, userId: string) => Promise<void> | void;
	/**
	 * Hook called when an alias is verified
	 */
	onAliasVerified?: (alias: LoginAlias, userId: string) => Promise<void> | void;
}

export interface LoginAliasPlugin {
	id: "login-alias";
	endpoints: Record<string, any>;
	schema: {
		loginAlias: typeof import("./schema").loginAlias;
	};
	options: LoginAliasPluginOptions;
}
