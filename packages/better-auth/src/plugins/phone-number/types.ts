import type { GenericEndpointContext } from "@better-auth/core";
import type { User } from "../../types";
import type { Awaitable } from "../../types/helper";
import type { InferOptionSchema } from "../../types/plugins";
import type { schema } from "./schema";

export interface UserWithPhoneNumber extends User {
	phoneNumber: string;
	phoneNumberVerified: boolean;
}

export interface PhoneNumberOptions {
	/**
	 * Length of the OTP code
	 * @default 6
	 */
	otpLength?: number | undefined;
	/**
	 * Send OTP code to the user
	 *
	 * @param phoneNumber
	 * @param code
	 * @returns
	 */
	sendOTP: (
		data: { phoneNumber: string; code: string },
		ctx?: GenericEndpointContext | undefined,
	) => Awaitable<void>;
	/**
	 * Custom OTP verification function
	 *
	 * If provided, this function will be called instead of the internal verification logic.
	 * This is useful when using SMS providers that handle their own OTP generation and verification.
	 *
	 * @param data - Contains phone number and OTP code
	 * @param request - The request object
	 * @returns true if OTP is valid, false otherwise
	 */
	verifyOTP?:
		| ((
				data: {
					phoneNumber: string;
					code: string;
				},
				ctx?: GenericEndpointContext,
		  ) => Awaitable<boolean>)
		| undefined;
	/**
	 * a callback to send otp on user requesting to reset their password
	 *
	 * @param data - contains phone number and code
	 * @param request - the request object
	 * @returns
	 */
	sendPasswordResetOTP?:
		| ((
				data: { phoneNumber: string; code: string },
				ctx?: GenericEndpointContext,
		  ) => Awaitable<void>)
		| undefined;
	/**
	 * Expiry time of the OTP code in seconds
	 * @default 300
	 */
	expiresIn?: number | undefined;
	/**
	 * Function to validate phone number
	 *
	 * by default any string is accepted
	 */
	phoneNumberValidator?:
		| ((phoneNumber: string) => Awaitable<boolean>)
		| undefined;
	/**
	 * Require a phone number verification before signing in
	 *
	 * @default false
	 */
	requireVerification?: boolean | undefined;
	/**
	 * Callback when phone number is verified
	 */
	callbackOnVerification?:
		| ((
				data: {
					phoneNumber: string;
					user: UserWithPhoneNumber;
				},
				ctx?: GenericEndpointContext,
		  ) => Awaitable<void>)
		| undefined;
	/**
	 * Sign up user after phone number verification
	 *
	 * the user will be signed up with the temporary email
	 * and the phone number will be updated after verification
	 */
	signUpOnVerification?:
		| {
				/**
				 * When a user signs up, a temporary email will be need to be created
				 * to sign up the user. This function should return a temporary email
				 * for the user given the phone number
				 *
				 * @param phoneNumber
				 * @returns string (temporary email)
				 */
				getTempEmail: (phoneNumber: string) => string;
				/**
				 * When a user signs up, a temporary name will be need to be created
				 * to sign up the user. This function should return a temporary name
				 * for the user given the phone number
				 *
				 * @param phoneNumber
				 * @returns string (temporary name)
				 *
				 * @default phoneNumber - the phone number will be used as the name
				 */
				getTempName?: (phoneNumber: string) => string;
		  }
		| undefined;
	/**
	 * Custom schema for the admin plugin
	 */
	schema?: InferOptionSchema<typeof schema> | undefined;
	/**
	 * Allowed attempts for the OTP code
	 * @default 3
	 */
	allowedAttempts?: number | undefined;
}
