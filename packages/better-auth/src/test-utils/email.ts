/**
 * Generates a unique email address for testing purposes.
 *
 * @param prefix - Optional prefix for the email (default: "test")
 * @param domain - Optional domain for the email (default: "test.com")
 * @returns A unique email address in the format `{prefix}-{uuid}@{domain}`
 *
 * @example
 * ```ts
 * generateEmail() // "test-550e8400-e29b-41d4-a716-446655440000@test.com"
 * generateEmail("user") // "user-550e8400-e29b-41d4-a716-446655440000@test.com"
 * generateEmail("admin", "example.com") // "admin-550e8400-e29b-41d4-a716-446655440000@example.com"
 * ```
 */
export function generateEmail(
	prefix: string = "test",
	domain: string = "test.com",
): string {
	return `${prefix}-${crypto.randomUUID()}@${domain}`;
}
