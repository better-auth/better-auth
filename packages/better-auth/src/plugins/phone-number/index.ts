import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { mergeSchema } from "../../db/schema";
import { PACKAGE_VERSION } from "../../version";
import { PHONE_NUMBER_ERROR_CODES } from "./error-codes";
import type { RequiredPhoneNumberOptions } from "./routes";
import {
	consumePhoneNumberOTP,
	requestPasswordResetPhoneNumber,
	resetPasswordPhoneNumber,
	sendPhoneNumberOTP,
	signInPhoneNumber,
	verifyPhoneNumber,
} from "./routes";
import { schema } from "./schema";
import type { PhoneNumberOptions, UserWithPhoneNumber } from "./types";

export type { PhoneNumberOptions, UserWithPhoneNumber };

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"phone-number": {
			creator: typeof phoneNumber;
		};
	}
}

export const phoneNumber = (options?: PhoneNumberOptions | undefined) => {
	const opts = {
		expiresIn: options?.expiresIn || 300,
		otpLength: options?.otpLength || 6,
		...options,
		phoneNumber: "phoneNumber",
		phoneNumberVerified: "phoneNumberVerified",
		code: "code",
		createdAt: "createdAt",
	};

	return {
		id: "phone-number",
		version: PACKAGE_VERSION,
		init() {
			return {
				options: {
					databaseHooks: {
						user: {
							update: {
								async before(data) {
									// Atomically reset verified flag when the number is cleared
									if (
										opts.phoneNumber in data &&
										data[opts.phoneNumber] === null
									) {
										return {
											data: {
												...data,
												[opts.phoneNumberVerified]: false,
											},
										};
									}
								},
							},
						},
					},
				},
			};
		},
		hooks: {
			before: [
				{
					matcher: (ctx) =>
						// Block phone number changes except disassociation (when phoneNumber is null)
						ctx.path === "/update-user" &&
						"phoneNumber" in ctx.body &&
						ctx.body.phoneNumber !== null,
					handler: createAuthMiddleware(async (_ctx) => {
						throw APIError.from(
							"BAD_REQUEST",
							PHONE_NUMBER_ERROR_CODES.PHONE_NUMBER_CANNOT_BE_UPDATED,
						);
					}),
				},
			],
		},
		endpoints: {
			signInPhoneNumber: signInPhoneNumber(opts as RequiredPhoneNumberOptions),
			sendPhoneNumberOTP: sendPhoneNumberOTP(
				opts as RequiredPhoneNumberOptions,
			),
			consumePhoneNumberOTP: consumePhoneNumberOTP(
				opts as RequiredPhoneNumberOptions,
			),
			verifyPhoneNumber: verifyPhoneNumber(opts as RequiredPhoneNumberOptions),
			requestPasswordResetPhoneNumber: requestPasswordResetPhoneNumber(
				opts as RequiredPhoneNumberOptions,
			),
			resetPasswordPhoneNumber: resetPasswordPhoneNumber(
				opts as RequiredPhoneNumberOptions,
			),
		},
		schema: mergeSchema(schema, options?.schema),
		rateLimit: [
			{
				pathMatcher(path) {
					return path.startsWith("/phone-number");
				},
				window: 60,
				max: 10,
			},
		],
		ui: {
			capabilities: {
				"phone-number": {
					id: "phone-number",
					enabled: true,
					metadata: {
						signUpOnVerification: Boolean(opts.signUpOnVerification),
						otpLength: opts.otpLength,
					},
					routes: {
						signIn: {
							type: "auth-route",
							path: "/sign-in/phone-number",
							method: "POST",
						},
						sendOtp: {
							type: "auth-route",
							path: "/phone-number/send-otp",
							method: "POST",
						},
						verify: {
							type: "auth-route",
							path: "/phone-number/verify",
							method: "POST",
						},
						requestPasswordReset: {
							type: "auth-route",
							path: "/phone-number/request-password-reset",
							method: "POST",
						},
						resetPassword: {
							type: "auth-route",
							path: "/phone-number/reset-password",
							method: "POST",
						},
					},
				},
			},
		},
		options,
		$ERROR_CODES: PHONE_NUMBER_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
