/**
 * Creates an instance-scoped OTP store for capturing OTPs during testing.
 * Each auth instance gets its own store to avoid cross-contamination.
 */
export function createOTPStore() {
	const otpStore = new Map<string, string>();

	return {
		capture(identifier: string, otp: string): void {
			otpStore.set(identifier, otp);
		},
		get(identifier: string): string | undefined {
			return otpStore.get(identifier);
		},
		clear(): void {
			otpStore.clear();
		},
	};
}
