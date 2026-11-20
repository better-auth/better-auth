import type { GenericEndpointContext } from "@better-auth/core";

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export type RequiredEmailOTPOptions = WithRequired<
	EmailOTPOptions,
	"expiresIn" | "generateOTP" | "storeOTP"
>;

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
			type:
				| "sign-in"
				| "email-verification"
				| "forget-password"
				| "change-email";
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
			type:
				| "sign-in"
				| "email-verification"
				| "forget-password"
				| "change-email";
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
	 * Strategy for handling OTP when the user requests a new OTP
	 * while an existing one is still valid.
	 *
	 * - `"rotate"`: Always generates a new OTP (default behavior).
	 * - `"reuse"`: Resends the same OTP and extends its expiry.
	 *   Only works when the OTP is recoverable (plain, encrypted, or custom encrypt/decrypt).
	 *   Falls back to `"rotate"` when OTP is hashed.
	 *
	 * @default "rotate"
	 */
	resendStrategy?: "rotate" | "reuse" | undefined;
	/**
	 * Callback fired when an OTP is generated (before hashing/storing).
	 *
	 * This is primarily used by the `testUtils` plugin with `captureOTP: true`
	 * to capture plaintext OTPs for testing purposes.
	 *
	 * @internal
	 */
	onOTPCreated?: (data: {
		email: string;
		otp: string;
		type: "sign-in" | "email-verification" | "forget-password" | "change-email";
	}) => void;
	/**
	 * Change email configuration for the change email with OTP flow
	 *
	 * @default {
	 *  enabled: false,
	 *  verifyCurrentEmail: false,
	 * }
	 */
	changeEmail?: {
		enabled?: boolean;
		verifyCurrentEmail?: boolean;
	};
	/**
	 * Override the default email verification to use email otp instead
	 *
	 * @default false
	 */
	overrideDefaultEmailVerification?: boolean | undefined;
	/**
	 * Rate limit configuration
	 *
	 * @default {
	 * 	window: 60,
	 * 	max: 3,
	 * }
	 */
	rateLimit?: {
		window: number;
		max: number;
	};
}
