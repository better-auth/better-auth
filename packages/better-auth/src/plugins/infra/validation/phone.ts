import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth/types";
import type { CountryCode, PhoneNumber } from "libphonenumber-js";
import {
	isValidPhoneNumber,
	parsePhoneNumberFromString,
} from "libphonenumber-js";

/**
 * Common fake/test phone numbers that should be blocked
 * These are numbers commonly used in testing, movies, documentation, etc.
 */
const INVALID_PHONE_NUMBERS = new Set([
	// US/Canada fake numbers (555 exchange - reserved for fiction)
	"+15550000000",
	"+15550001111",
	"+15550001234",
	"+15551234567",
	"+15555555555",
	"+15551111111",
	"+15550000001",
	"+15550123456",
	"+12125551234",
	"+13105551234",
	"+14155551234",
	"+12025551234",
	// Common test patterns
	"+10000000000",
	"+11111111111",
	"+12222222222",
	"+13333333333",
	"+14444444444",
	"+15555555555",
	"+16666666666",
	"+17777777777",
	"+18888888888",
	"+19999999999",
	"+11234567890",
	"+10123456789",
	"+19876543210",
	// UK fake numbers (Ofcom reserved ranges)
	"+441632960000",
	"+447700900000",
	"+447700900001",
	"+447700900123",
	"+447700900999",
	"+442079460000",
	"+442079460123",
	"+441134960000",
	// International test patterns
	"+0000000000",
	"+1000000000",
	"+123456789",
	"+1234567890",
	"+12345678901",
	"+0123456789",
	"+9876543210",
	"+11111111111",
	"+99999999999",
	// Common placeholder patterns with country codes
	"+491234567890",
	"+491111111111",
	"+33123456789",
	"+33111111111",
	"+61123456789",
	"+61111111111",
	"+81123456789",
	"+81111111111",
	// Premium rate / special service numbers often misused
	"+19001234567",
	"+19761234567",
	// Emergency/service numbers (should never be user phone numbers)
	"+1911",
	"+1411",
	"+1611",
	"+44999",
	"+44112",
]);

/**
 * Patterns that indicate fake/test phone numbers
 */
const INVALID_PHONE_PATTERNS = [
	// All same digit (excluding country code)
	/^\+\d(\d)\1{6,}$/,
	// Sequential digits ascending
	/^\+\d*1234567890/,
	/^\+\d*0123456789/,
	// Sequential digits descending
	/^\+\d*9876543210/,
	/^\+\d*0987654321/,
	// Repeating pairs
	/^\+\d*(12){4,}/,
	/^\+\d*(21){4,}/,
	/^\+\d*(00){4,}/,
	// US 555 exchange (reserved for fiction)
	/^\+1\d{3}555\d{4}$/,
	// Numbers that are too short (less than 7 digits after country code)
	/^\+\d{1,3}\d{1,5}$/,
	// All zeros (excluding country code)
	/^\+\d+0{7,}$/,
	// Keyboard patterns
	/^\+\d*147258369/,
	/^\+\d*258369147/,
	/^\+\d*369258147/,
	/^\+\d*789456123/,
	/^\+\d*123456789/,
	// Obviously fake patterns
	/^\+\d*1234512345/,
	/^\+\d*1111122222/,
	/^\+\d*1212121212/,
	/^\+\d*1010101010/,
];

/**
 * Invalid area codes / prefixes that indicate test numbers
 * Key: country code, Value: set of invalid prefixes
 */
const INVALID_PREFIXES_BY_COUNTRY: Record<string, Set<string>> = {
	US: new Set([
		"555", // Reserved for fiction
		"000", // Invalid
		"111", // Invalid
		"911", // Emergency
		"411", // Directory
		"611", // Customer service
	]),
	CA: new Set([
		"555", // Reserved for fiction
		"000", // Invalid
		"911", // Emergency
	]),
	GB: new Set([
		"7700900", // Ofcom drama/test range
		"1632960", // Ofcom drama range
		"1134960", // Ofcom drama range
	]),
	AU: new Set([
		"0491570", // ACMA test range
		"0491571", // ACMA test range
		"0491572", // ACMA test range
	]),
};

/**
 * Parse a phone number string into a PhoneNumber object
 * @param phone - The phone number string (with or without country code)
 * @param defaultCountry - Default country code if not included in phone string
 * @returns PhoneNumber object or undefined if parsing fails
 */
export const parsePhone = (
	phone: string,
	defaultCountry?: CountryCode,
): PhoneNumber | undefined => {
	return parsePhoneNumberFromString(phone, defaultCountry);
};

/**
 * Check if a phone number is a commonly used fake/test number
 * @param phone - The phone number to check (E.164 format preferred)
 * @param defaultCountry - Default country code if not included in phone string
 * @returns true if the phone appears to be fake/test, false if it seems legitimate
 */
export const isFakePhoneNumber = (
	phone: string,
	defaultCountry?: CountryCode,
): boolean => {
	const parsed = parsePhoneNumberFromString(phone, defaultCountry);
	if (!parsed) return true; // Can't parse = treat as fake

	const e164 = parsed.number; // E.164 format
	const nationalNumber = parsed.nationalNumber;
	const country = parsed.country;

	// Check exact matches
	if (INVALID_PHONE_NUMBERS.has(e164)) {
		return true;
	}

	// Check patterns
	for (const pattern of INVALID_PHONE_PATTERNS) {
		if (pattern.test(e164)) {
			return true;
		}
	}

	// Check country-specific invalid prefixes
	if (country && INVALID_PREFIXES_BY_COUNTRY[country]) {
		const prefixes = INVALID_PREFIXES_BY_COUNTRY[country];
		for (const prefix of prefixes) {
			if (nationalNumber.startsWith(prefix)) {
				return true;
			}
		}
	}

	// Check for all same digits in national number
	if (/^(\d)\1+$/.test(nationalNumber)) {
		return true;
	}

	// Check for simple sequential patterns in national number
	const digits = nationalNumber.split("").map(Number);
	let isSequential = digits.length >= 6;
	for (let i = 1; i < digits.length && isSequential; i++) {
		const current = digits[i];
		const previous = digits[i - 1];
		if (
			current === undefined ||
			previous === undefined ||
			(current !== previous + 1 && current !== previous - 1)
		) {
			isSequential = false;
		}
	}
	if (isSequential) {
		return true;
	}

	return false;
};

/**
 * Validate a phone number format
 * @param phone - The phone number to validate
 * @param defaultCountry - Default country code if not included in phone string
 * @returns true if the phone number is valid
 */
export const isValidPhone = (
	phone: string,
	defaultCountry?: CountryCode,
): boolean => {
	return isValidPhoneNumber(phone, defaultCountry);
};

/**
 * Check if a phone number is a mobile number
 * @param phone - The phone number to check
 * @param defaultCountry - Default country code if not included in phone string
 * @returns true if mobile, false if not mobile or unknown
 */
export const isMobilePhone = (
	phone: string,
	defaultCountry?: CountryCode,
): boolean => {
	const parsed = parsePhoneNumberFromString(phone, defaultCountry);
	if (!parsed) return false;

	const type = parsed.getType();
	return type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE";
};

/**
 * Get the type of phone number
 * @param phone - The phone number to check
 * @param defaultCountry - Default country code if not included in phone string
 * @returns Phone type or undefined
 */
export const getPhoneType = (
	phone: string,
	defaultCountry?: CountryCode,
):
	| "MOBILE"
	| "FIXED_LINE"
	| "FIXED_LINE_OR_MOBILE"
	| "PREMIUM_RATE"
	| "TOLL_FREE"
	| "SHARED_COST"
	| "VOIP"
	| "PERSONAL_NUMBER"
	| "PAGER"
	| "UAN"
	| "VOICEMAIL"
	| undefined => {
	const parsed = parsePhoneNumberFromString(phone, defaultCountry);
	return parsed?.getType();
};

/**
 * Format a phone number to E.164 format (+1234567890)
 * @param phone - The phone number to format
 * @param defaultCountry - Default country code if not included in phone string
 * @returns E.164 formatted phone number or undefined
 */
export const formatPhoneE164 = (
	phone: string,
	defaultCountry?: CountryCode,
): string | undefined => {
	const parsed = parsePhoneNumberFromString(phone, defaultCountry);
	return parsed?.number;
};

/**
 * Format a phone number to international format (+1 234 567 890)
 * @param phone - The phone number to format
 * @param defaultCountry - Default country code if not included in phone string
 * @returns International formatted phone number or undefined
 */
export const formatPhoneInternational = (
	phone: string,
	defaultCountry?: CountryCode,
): string | undefined => {
	const parsed = parsePhoneNumberFromString(phone, defaultCountry);
	return parsed?.formatInternational();
};

/**
 * Format a phone number to national format (234 567 890)
 * @param phone - The phone number to format
 * @param defaultCountry - Default country code if not included in phone string
 * @returns National formatted phone number or undefined
 */
export const formatPhoneNational = (
	phone: string,
	defaultCountry?: CountryCode,
): string | undefined => {
	const parsed = parsePhoneNumberFromString(phone, defaultCountry);
	return parsed?.formatNational();
};

/**
 * Get the country code from a phone number
 * @param phone - The phone number to check
 * @param defaultCountry - Default country code if not included in phone string
 * @returns Country code (e.g., "US", "GB") or undefined
 */
export const getPhoneCountry = (
	phone: string,
	defaultCountry?: CountryCode,
): CountryCode | undefined => {
	const parsed = parsePhoneNumberFromString(phone, defaultCountry);
	return parsed?.country;
};

/**
 * Validate phone number options
 */
export interface ValidatePhoneOptions {
	/** Require mobile numbers only (reject landlines) */
	mobileOnly?: boolean;
	/** List of allowed country codes (e.g., ['US', 'CA', 'GB']) */
	allowedCountries?: CountryCode[];
	/** List of blocked country codes */
	blockedCountries?: CountryCode[];
	/** Block fake/test phone numbers */
	blockFakeNumbers?: boolean;
	/** Block premium rate numbers */
	blockPremiumRate?: boolean;
	/** Block toll-free numbers */
	blockTollFree?: boolean;
	/** Block VOIP numbers */
	blockVoip?: boolean;
	/** Default country code for parsing */
	defaultCountry?: CountryCode;
}

/**
 * Comprehensive phone number validation
 * @param phone - The phone number to validate
 * @param options - Validation options
 * @returns true if valid, false otherwise
 */
export const validatePhone = (
	phone: string,
	options: ValidatePhoneOptions = {},
): boolean => {
	const {
		mobileOnly = false,
		allowedCountries,
		blockedCountries,
		blockFakeNumbers = true,
		blockPremiumRate = true,
		blockTollFree = false,
		blockVoip = false,
		defaultCountry,
	} = options;

	// Basic format validation
	if (!isValidPhone(phone, defaultCountry)) {
		return false;
	}

	const parsed = parsePhoneNumberFromString(phone, defaultCountry);
	if (!parsed) {
		return false;
	}

	// Check fake numbers
	if (blockFakeNumbers && isFakePhoneNumber(phone, defaultCountry)) {
		return false;
	}

	// Check country restrictions
	const country = parsed.country;
	if (country) {
		if (allowedCountries && !allowedCountries.includes(country)) {
			return false;
		}
		if (blockedCountries?.includes(country)) {
			return false;
		}
	}

	// Check phone type restrictions
	const phoneType = parsed.getType();

	if (mobileOnly) {
		if (phoneType !== "MOBILE" && phoneType !== "FIXED_LINE_OR_MOBILE") {
			return false;
		}
	}

	if (blockPremiumRate && phoneType === "PREMIUM_RATE") {
		return false;
	}

	if (blockTollFree && phoneType === "TOLL_FREE") {
		return false;
	}

	if (blockVoip && phoneType === "VOIP") {
		return false;
	}

	return true;
};

/**
 * Create a phone number validator function for Better Auth's phoneNumberValidator option
 * @param options - Validation options
 * @returns Validator function compatible with Better Auth
 */
export const createPhoneValidator = (
	options: ValidatePhoneOptions = {},
): ((phoneNumber: string) => boolean) => {
	return (phoneNumber: string) => validatePhone(phoneNumber, options);
};

// ============================================================================
// Phone Number Paths for Better Auth hooks
// ============================================================================

const phonePaths = [
	"/phone-number/send-otp",
	"/phone-number/verify",
	"/sign-in/phone-number",
	"/phone-number/request-password-reset",
	"/phone-number/reset-password",
];

const allPhonePaths = new Set(phonePaths);

interface PhoneContext {
	body?: Record<string, unknown>;
	query?: Record<string, unknown>;
}

const getPhoneNumber = (ctx: PhoneContext): unknown =>
	ctx.body?.phoneNumber ?? ctx.query?.phoneNumber;

/**
 * Phone validation options for the plugin
 */
export interface PhoneValidationPluginOptions extends ValidatePhoneOptions {
	/** Custom error message for invalid phone numbers */
	errorMessage?: string;
}

/**
 * Better Auth plugin for phone number validation
 * Validates phone numbers on all phone-related endpoints
 */
export const phoneValidationHooks = {
	before: [
		{
			matcher: (context: { path?: string }) =>
				!!context.path && allPhonePaths.has(context.path),
			handler: createAuthMiddleware(async (ctx) => {
				const phoneNumber = getPhoneNumber(ctx);

				if (typeof phoneNumber !== "string") return;

				const isValid = validatePhone(phoneNumber);
				if (!isValid) {
					throw new APIError("BAD_REQUEST", {
						message: "Invalid phone number",
					});
				}
			}),
		},
	],
} satisfies BetterAuthPlugin["hooks"];

export type { CountryCode, PhoneNumber };
