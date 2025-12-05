import type { GenericEndpointContext } from "@better-auth/core";

export interface EmailOTPOptions {
	/**
	 * Function to send email verification.
	 *
	 * It is recommended to not await the email sending to avoid timing attacks.
	 * On serverless platforms, use `waitUntil` or similar to ensure the email is sent.
	 */
	sendVerificationOTP: (
		data: {
			email: string;
			otp: string;
			type: "sign-in" | "email-verification" | "forget-password";
		},
		ctx?: GenericEndpointContext | undefined,
	) => Promise<void>;
	/**
	 * Length of the OTP
	 *
	 * @default 6
	 */
	otpLength?: number | undefined;
	/**
	 * Expiry time of the OTP in seconds
	 *
	 * @default 300 (5 minutes)
	 */
	expiresIn?: number | undefined;
	/**
	 * Custom function to generate otp
	 */
	generateOTP?: (
		data: {
			email: string;
			type: "sign-in" | "email-verification" | "forget-password";
		},
		ctx?: GenericEndpointContext,
	) => string | undefined;
	/**
	 * Send email verification on sign-up
	 *
	 * @Default false
	 */
	sendVerificationOnSignUp?: boolean | undefined;
	/**
	 * A boolean value that determines whether to prevent
	 * automatic sign-up when the user is not registered.
	 *
	 * @Default false
	 */
	disableSignUp?: boolean | undefined;
	/**
	 * Allowed attempts for the OTP code
	 * @default 3
	 */
	allowedAttempts?: number | undefined;
	/**
	 * Store the OTP in your database in a secure way
	 * Note: This will not affect the OTP sent to the user, it will only affect the OTP stored in your database
	 *
	 * @default "plain"
	 */
	storeOTP?:
		| (
				| "hashed"
				| "plain"
				| "encrypted"
				| { hash: (otp: string) => Promise<string> }
				| {
						encrypt: (otp: string) => Promise<string>;
						decrypt: (otp: string) => Promise<string>;
				  }
		  )
		| undefined;
	/**
	 * Override the default email verification to use email otp instead
	 *
	 * @default false
	 */
	overrideDefaultEmailVerification?: boolean | undefined;
}
