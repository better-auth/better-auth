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
		id: {
			type: "string" as const,
			required: true,
			unique: true,
		},
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
			required: true,
			defaultValue: false,
		},
		/**
		 * Whether this is the primary alias for this type
		 * (e.g., primary email, primary phone)
		 */
		isPrimary: {
			type: "boolean" as const,
			required: true,
			defaultValue: false,
		},
		/**
		 * Metadata for the alias (e.g., display value for case-sensitive usernames)
		 */
		metadata: {
			type: "string" as const,
			required: false,
		},
		createdAt: {
			type: "date" as const,
			required: true,
		},
		updatedAt: {
			type: "date" as const,
			required: true,
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
 * Supported alias types
 */
export const AliasType = {
	EMAIL: "email",
	USERNAME: "username",
	PHONE: "phone",
	CUSTOM: "custom",
} as const;

export type AliasType = (typeof AliasType)[keyof typeof AliasType];
