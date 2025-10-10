import { z } from "zod";

/**
 * Login Alias Schema
 *
 * This table stores alternative login identifiers for users.
 * Each alias points to a user and has a type (email, username, phone, etc.)
 */
export const loginAlias = {
	modelName: "loginAlias",
	fields: {
		/**
		 * The user ID this alias belongs to
		 */
		userId: {
			type: "string" as const,
			required: true,
			references: {
				model: "user",
				field: "id",
			},
		},
		/**
		 * Type of alias (email, username, phone, custom)
		 */
		type: {
			type: "string" as const,
			required: true,
		},
		/**
		 * The actual identifier value (normalized/lowercase for emails and usernames)
		 */
		value: {
			type: "string" as const,
			required: true,
			unique: true,
		},
		/**
		 * Whether this alias has been verified
		 */
		verified: {
			type: "boolean" as const,
			required: false,
			defaultValue: false,
		},
		/**
		 * Whether this is the primary alias for this type
		 * (e.g., primary email, primary phone)
		 */
		isPrimary: {
			type: "boolean" as const,
			required: false,
			defaultValue: false,
		},
		/**
		 * Metadata for the alias (e.g., display value for case-sensitive usernames)
		 */
		metadata: {
			type: "string" as const,
			required: false,
		},
	},
} as const;

export const loginAliasSchema = z.object({
	id: z.string(),
	userId: z.string(),
	type: z.string(),
	value: z.string(),
	verified: z.boolean().default(false),
	isPrimary: z.boolean().default(false),
	metadata: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type LoginAlias = z.infer<typeof loginAliasSchema>;

/**
 * Standard alias types
 * These are commonly used types, but the plugin supports any string type
 * allowing integration with any better-auth plugin or custom identifier
 */
export const AliasType = {
	/** Standard email address */
	EMAIL: "email",
	/** Username (works with username plugin) */
	USERNAME: "username",
	/** Phone number (works with phone-number plugin) */
	PHONE: "phone",
	/** OAuth provider prefix (when trackOAuthProviders is enabled) */
	OAUTH_PREFIX: "oauth_",
	/** Custom/other identifier types */
	CUSTOM: "custom",
} as const;

export type AliasType = (typeof AliasType)[keyof typeof AliasType];

/**
 * Note: The plugin is not limited to these types!
 * You can use any string as an alias type, such as:
 *
 * **Standard types:**
 * - 'email' - Email addresses
 * - 'username' - Usernames
 * - 'phone' - Phone numbers
 *
 * **OAuth providers (if trackOAuthProviders: true):**
 * - 'oauth_google' - Google account connection
 * - 'oauth_github' - GitHub account connection
 * - 'oauth_facebook' - Facebook account connection
 * - 'oauth_*' - Any social provider from better-auth settings
 *
 * Note: OAuth providers are tracked in the 'account' table by default.
 * Set trackOAuthProviders: true to also show them as aliases for
 * a unified identity view via /alias/list
 *
 * **Custom identifiers:**
 * - 'employee_id' - Employee identifier
 * - 'student_id' - Student identifier
 * - 'social_security' - SSN
 * - 'passport_number' - Passport
 * - or any other identifier from your system
 */
