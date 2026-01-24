import { generateId } from "@better-auth/core/utils/id";

export interface GenerateEmailOptions {
	/**
	 * Prefix for the email (default: "test")
	 */
	prefix?: string;
	/**
	 * Domain for the email (default: "test.com")
	 */
	domain?: string;
	/**
	 * Custom ID to use in the email. If not provided, generateId() will be used.
	 */
	id?: string | (() => string);
}

/**
 * Generates a unique email address for testing purposes.
 *
 * @param options - Optional configuration for email generation
 * @returns A unique email address in the format `{prefix}-{id}@{domain}`
 *
 * @example
 * ```ts
 * generateEmail() // "test-a1b2c3d4e5f6g7h8@test.com"
 * generateEmail({ prefix: "user" }) // "user-a1b2c3d4e5f6g7h8@test.com"
 * generateEmail({ prefix: "admin", domain: "example.com" }) // "admin-a1b2c3d4e5f6g7h8@example.com"
 * generateEmail({ id: "custom-id" }) // "test-custom-id@test.com"
 * generateEmail({ id: () => crypto.randomUUID() }) // "test-550e8400-e29b-41d4-a716-446655440000@test.com"
 * ```
 */
export function generateEmail(options: GenerateEmailOptions = {}): string {
	const { prefix = "test", domain = "test.com", id } = options;
	const uniqueId = typeof id === "function" ? id() : (id ?? generateId());
	return `${prefix}-${uniqueId}@${domain}`;
}
