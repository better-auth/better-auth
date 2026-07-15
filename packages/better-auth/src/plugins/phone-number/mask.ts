/**
 * Paths that may return the full phone number when masking is enabled.
 * Cookie cache always masks regardless of path.
 */
export const PHONE_NUMBER_REVEAL_PATHS = [
	"/sign-in/phone-number",
	"/phone-number/verify",
] as const;

/**
 * Default phone mask: preserve leading `+`, replace digits with `*`, keep last 4.
 *
 * @example defaultMaskPhoneNumber("+15551234567") // "+*******4567"
 */
export function defaultMaskPhoneNumber(phoneNumber: string): string {
	if (phoneNumber.includes("*")) {
		return phoneNumber;
	}
	const digits = phoneNumber.replace(/\D/g, "");
	if (digits.length === 0) {
		return phoneNumber;
	}
	if (digits.length <= 4) {
		return phoneNumber.startsWith("+")
			? `+${"*".repeat(digits.length)}`
			: "*".repeat(digits.length);
	}
	const last4 = digits.slice(-4);
	const masked = "*".repeat(digits.length - 4) + last4;
	return phoneNumber.startsWith("+") ? `+${masked}` : masked;
}

export function shouldRevealPhoneNumber(
	meta?:
		| {
				forCookie?: boolean | undefined;
				path?: string | undefined;
		  }
		| undefined,
): boolean {
	if (meta?.forCookie) {
		return false;
	}
	const path = meta?.path;
	if (!path) {
		return false;
	}
	if (path.startsWith("/admin/")) {
		return true;
	}
	return (PHONE_NUMBER_REVEAL_PATHS as readonly string[]).includes(path);
}

export function resolveMaskPhoneNumberOption(
	maskPhoneNumber:
		| boolean
		| { mask?: (phoneNumber: string) => string }
		| undefined,
): { enabled: boolean; mask: (phoneNumber: string) => string } {
	if (!maskPhoneNumber) {
		return { enabled: false, mask: defaultMaskPhoneNumber };
	}
	if (maskPhoneNumber === true) {
		return { enabled: true, mask: defaultMaskPhoneNumber };
	}
	return {
		enabled: true,
		mask: maskPhoneNumber.mask ?? defaultMaskPhoneNumber,
	};
}
