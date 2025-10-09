import { AliasType } from "./schema";

/**
 * Normalize an alias value based on its type
 *
 * Standard types (email, username, phone) have built-in normalization.
 * Custom types from other plugins or your system default to basic trimming.
 *
 * @param value - The raw alias value
 * @param type - The alias type
 * @returns Normalized value for storage
 */
export function normalizeAliasValue(value: string, type: string): string {
	switch (type) {
		case AliasType.EMAIL:
			return value.toLowerCase().trim();
		case AliasType.USERNAME:
			return value.toLowerCase().trim();
		case AliasType.PHONE:
			// Remove all non-digit characters for E.164 compatibility
			return value.replace(/\D/g, "");
		default:
			// For custom types (employee_id, student_id, etc.), just trim
			// You can provide a custom normalizeValue function in plugin options
			return value.trim();
	}
}

/**
 * Validate an alias value based on its type
 *
 * Standard types (email, username, phone) have built-in validation.
 * Custom types from other plugins or your system default to basic non-empty check.
 *
 * @param value - The alias value to validate
 * @param type - The alias type
 * @returns true if valid, false otherwise
 */
export function validateAliasValue(value: string, type: string): boolean {
	switch (type) {
		case AliasType.EMAIL:
			// Basic email validation
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			return emailRegex.test(value);
		case AliasType.USERNAME:
			// Username: 3-30 chars, alphanumeric, underscores, hyphens
			const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
			return usernameRegex.test(value);
		case AliasType.PHONE:
			// Phone: at least 10 digits after normalization (E.164)
			const normalized = normalizeAliasValue(value, type);
			return normalized.length >= 10 && normalized.length <= 15;
		default:
			// For custom types (employee_id, student_id, etc.), just check non-empty
			// You can override validation logic by checking the type in your app
			return value.trim().length > 0;
	}
}

/**
 * Get the display value for an alias
 * Useful for case-sensitive usernames where we store lowercase but display original
 */
export function getAliasDisplayValue(
	value: string,
	metadata?: string | null,
): string {
	if (metadata) {
		try {
			const parsed = JSON.parse(metadata);
			return parsed.displayValue || value;
		} catch {
			return value;
		}
	}
	return value;
}

/**
 * Create metadata for an alias
 * Used to store additional info like the original case-sensitive value
 */
export function createAliasMetadata(data: Record<string, any>): string {
	return JSON.stringify(data);
}
