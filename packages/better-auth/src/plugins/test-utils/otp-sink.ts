/**
 * In-memory OTP store for capturing OTPs during testing.
 * OTPs are keyed by identifier (email, phone, etc.).
 * Tests should use unique identifiers to avoid collisions.
 */
const otpStore = new Map<string, string>();

export function captureOTP(identifier: string, otp: string): void {
	otpStore.set(identifier, otp);
}

export function getOTP(identifier: string): string | undefined {
	return otpStore.get(identifier);
}

export function clearAllOTPs(): void {
	otpStore.clear();
}
