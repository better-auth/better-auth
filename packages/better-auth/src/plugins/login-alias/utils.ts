import { AliasType } from "./schema";

/**
 * Normalize an alias value based on its type
 */
export function normalizeAliasValue(value: string, type: string): string {
	switch (type) {
		case AliasType.EMAIL:
			return value.toLowerCase().trim();
		case AliasType.USERNAME:
			return value.toLowerCase().trim();
		case AliasType.PHONE:
			// Remove all non-digit characters
			return value.replace(/\D/g, "");
		default:
			return value.trim();
	}
}

/**
 * Validate an alias value based on its type
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
			// Phone: at least 10 digits after normalization
			const normalized = normalizeAliasValue(value, type);
			return normalized.length >= 10 && normalized.length <= 15;
		default:
			// For custom types, just check it's not empty
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
